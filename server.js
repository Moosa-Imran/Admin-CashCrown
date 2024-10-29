const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const MongoStore = require('connect-mongo');
const session = require('express-session');
const cron = require('node-cron'); 
const PORT = 3000;
require('dotenv').config();

const mongoUri = process.env.MONGO_URI;
const app = express();

app.enable('trust proxy');

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoUri,
    dbName: 'Sessions',
    collectionName: 'Admin',
    ttl: 4 * 24 * 60 * 60,
  }),
  cookie: { 
    secure: false,
    httpOnly: true,
    maxAge: 4 * 24 * 60 * 60 * 1000,
    sameSite: 'lax', 
  }
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files (like HTML, CSS, JS) from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// MongoDB Connection
MongoClient.connect(mongoUri)
  .then(client => {
    console.log('Connected to MongoDB');

    const usersDb = client.db('Users');
    const transactionsDb = client.db('Transactions');
    const subscriptionsDb = client.db('Subscriptions');

    // Store the database instances in app.locals for access in routes
    app.locals.usersDb = usersDb;
    app.locals.transactionsDb = transactionsDb;
    app.locals.subscriptionsDb = subscriptionsDb;

    // Import and use the routes
    const routes = require('./routes');
    app.use('/', routes);

// Schedule the cron job to run at every midnight Pakistan time
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily profit increment task at midnight PKT...');
  try {
    const customersCollection = usersDb.collection('Customers');
    const currentDate = new Date(); // Get current date

    // Fetch all customers with 'ppd' field
    const customers = await customersCollection.find({ ppd: { $exists: true } }).toArray();

    // Loop over each customer and update their profit individually
    for (const customer of customers) {
      const ppd = customer.ppd || 0; // Default to 0 if 'ppd' is missing
      await customersCollection.updateOne(
        { _id: customer._id },
        {
          $inc: { profit: ppd },      // Increment 'profit' by the 'ppd' value for each customer
          $set: { lastCrawl: currentDate } // Set or update 'lastCrawl' with the current date
        }
      );
    }

    console.log(`Updated profit and lastCrawl for ${customers.length} customer(s) successfully.`);
  } catch (error) {
    console.error('Error updating customer profits:', error);
  }
}, {
  scheduled: true,
  timezone: "Asia/Karachi" // Set timezone to PKT
});
  })
  .catch(err => {
    console.error('Could not connect to MongoDB...', err);
    process.exit(1);  // Stop the server if the connection to MongoDB fails
  });

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
