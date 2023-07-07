const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_METHOD_SECRET);
const port = process.env.PORT || 5000;

const corsConfig = {
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
};
//middleware
app.use(cors(corsConfig));
app.options("", cors(corsConfig));
app.use(express.json());

// mongodb
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASS}@cluster0.et32bhj.mongodb.net/?retryWrites=true&w=majority`;

// JWT middleware, verify JWT
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  // console.log(authorization);
  if (!authorization) {
    return res.status(401).send({ error: true, message: "unauthorized acess" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized acess" });
    }
    // console.log(decoded);
    req.decoded = decoded;
    next();
  });
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("moviesDB").collection("users");
    const favoriteCollection = client.db("moviesDB").collection("favorite");
    const saveCollection = client.db("moviesDB").collection("save");
    const paymentCollection = client.db("moviesDB").collection("payment");
    const subscriptionCollection = client
      .db("moviesDB")
      .collection("subscriptions");

    // sign jwt
    app.post("/jwt", (req, res) => {
      const user = req.body;
      // console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      //   console.log("admin", email);
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    // User related APIS
    // all signup signup users
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // get all users
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // delete user
    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // get user by using id
    app.get("/getprofileinfo/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // get user by email
    app.get("/userprofile/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // update user profile
    app.put("/updateprofile/:id", async (req, res) => {
      const user = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateUser = {
        $set: {
          address: user.address,
          email: user.email,
          gender: user.gender,
          name: user.name,
          phone: user.phone,
          photo: user.photo,
        },
      };
      const result = await userCollection.updateOne(filter, updateUser);
      res.send(result);
    });

    //  check current user admin or not
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      // console.log("decoded", decodedEmail, "email", email);
      if (email !== decodedEmail) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    // set a role for admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // set subscription status
    app.patch("/subscriptionStatus/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const updateDoc = {
        $set: {
          subscriptionStatus: "paid",
          subscriptionDate: new Date(),
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Movie add delete related APIS

    // favorite movies
    app.post("/favorite", async (req, res) => {
      const favoriteMovie = req.body;
      const { email, id } = favoriteMovie;
      const query = { email: email, id: id };
      const existingMovie = await favoriteCollection.findOne(query);
      if (existingMovie) {
        return res.send({ message: "movie already added" });
      }
      const result = await favoriteCollection.insertOne(favoriteMovie);
      res.send(result);
    });
    // get favorite item
    app.get("/favorite/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await favoriteCollection.find(query).toArray();
      res.send(result);
    });
    // delete favorite item
    app.delete("/favorite/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await favoriteCollection.deleteOne(query);
      res.send(result);
    });

    // Watch later movies
    app.post("/save", async (req, res) => {
      const saveMovie = req.body;
      const { email, id } = saveMovie;
      const query = { email: email, id: id };
      const existingMovie = await saveCollection.findOne(query);
      if (existingMovie) {
        return res.send({ message: "movie already added" });
      }
      const result = await saveCollection.insertOne(saveMovie);
      res.send(result);
    });
    // get watch later item
    app.get("/save/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await saveCollection.find(query).toArray();
      res.send(result);
    });
    // delete watch later item
    app.delete("/save/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await saveCollection.deleteOne(query);
      res.send(result);
    });

    // get all subscription
    app.get("/subscriptions", async (req, res) => {
      const result = await subscriptionCollection.find().toArray();
      res.send(result);
    });

    // get specific subscription package
    app.get("/subscription/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await subscriptionCollection.findOne(query);
      res.send(result);
    });

    // PAYMENT RELATED APIS
    // payment intant
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // post payment collection
    app.post("/payment", verifyJWT, async (req, res) => {
      const payment = req.body;
      payment.date = new Date();
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    // get all payment
    app.get("/allpayment", verifyJWT, async (req, res) => {
      const { date } = req.body;
      const result = await paymentCollection
        .find()
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // get user spesic payment
    app.get("/payment", verifyJWT, async (req, res) => {
      const { date } = req.body;
      const email = req.query.email;
      const filter = { email: email };
      const result = await paymentCollection
        .find(filter)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Movie server is running");
});

app.listen(port, () => {
  console.log(`Movie server is running on port ${port}`);
});
