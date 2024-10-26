const express = require('express');
const path = require('path');
const { ObjectId } = require('mongodb'); 
const router = express.Router();


// Protected Route Middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    } else {
        return res.redirect('/');
    }
}


// Route for Fetching User's Detials
router.get('/fetchUser', async (req, res) => {
    // Get the user ID from the session
    const userId = req.session.user ? req.session.user.id : null;
    const usersDb = req.app.locals.usersDb;

    try {
        // Check if the user ID exists
        if (!userId) {
            return res.status(401).json({ status: false, message: 'User not authenticated.' });
        }

        // Search for the user in the Customers collection
        const user = await usersDb.collection('Admin').findOne({ _id: new ObjectId(userId) });
        if (user) {
            // If user is found, send the user data along with status
            res.status(200).json({ status: true, user });
        } else {
            // If user does not exist, send status false
            res.status(404).json({ status: false, message: 'User not found.' });
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ status: false, message: 'Internal server error' });
    }
});


// Login Route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const usersDb = req.app.locals.usersDb;
    try {
        // Search for the user by username or email
        const user = await usersDb.collection('Admin').findOne({username: username});

        // If user is not found
        if (!user) {
            return res.status(401).json({status: 'invalid', message: 'Invalid username.' });
        }

        if (user.password !== password) {
            return res.status(401).json({status: 'incorrect', message: 'Incorrect password.' });
        }

        // If valid, store user session and create cookie
        req.session.user = {
            id: user._id,
            username: user.username,
        };

        // Send success response
        res.status(200).json({status: 'success', message: 'Login successful!' });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({status: 'error',  message: 'Internal server error' });
    }
});

// Route to get investments by status
router.get('/investments/status', async (req, res) => {
    const { status } = req.query; // Get status from query parameters

    if (!status) {
        return res.status(400).json({ message: 'Status is required' });
    }

    try {
        // Connect to the Investments collection
        const investments = await req.app.locals.transactionsDb.collection('Investments').find({ status }).toArray();

        // Check if any documents were found
        if (investments.length === 0) {
            return res.status(404).json({ message: 'No investments found with the given status' });
        }

        // Send the found documents as a response
        return res.status(200).json(investments);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// Route to get investment by ID
router.get('/investments/:investId', async (req, res) => {
    const { investId } = req.params; // Get investId from URL parameters

    try {
        // Connect to the Investments collection and find the investment by ID
        const investment = await req.app.locals.transactionsDb.collection('Investments').findOne({ _id: new ObjectId(investId) });

        // Check if the investment was found
        if (!investment) {
            return res.status(404).json({ message: 'Investment not found' });
        }

        // Send the found investment as a response
        return res.status(200).json(investment);
    } catch (error) {
        console.error(error); // Log the error for debugging
        return res.status(500).json({ message: 'Internal server error' }); // Send server error response
    }
});

// Dictionary of plans and their respective amounts
const plans = {
    silver: 4,
    gold: 20,
    // Add more plans as needed
};

// Update investment status route
router.put('/investmentControl/:investId', async (req, res) => {
    const investId = req.params.investId; // Extracting investment ID from route parameters
    const { status, comment } = req.query; // Extracting status and comment from query parameters

    // Check if the investment exists in the Investments collection
    const investment = await req.app.locals.transactionsDb.collection('Investments').findOne({ _id: new ObjectId(investId) });

    if (!investment) {
        return res.status(404).json({ message: 'Investment not found' });
    }

    if (status === 'rejected') {
        // Update the investment status to 'rejected' and add comment
        await req.app.locals.transactionsDb.collection('Investments').updateOne(
            { _id: new ObjectId(investId) },
            {
                $set: {
                    status: 'rejected', // Update status to 'rejected'
                    comment // Add comment to the investment document
                }
            }
        );

        return res.status(200).json({ message: 'Investment rejected successfully', investmentId: investId });

    } else if (status === 'active') {
        const { username, plan, amount } = investment; // Get username, plan, and amount from the investment document

        // Update the investment status to 'active' and add comment
        await req.app.locals.transactionsDb.collection('Investments').updateOne(
            { _id: new ObjectId(investId) },
            {
                $set: {
                    status: 'active', // Update status to 'active'
                    comment // Add comment to the investment document
                }
            }
        );

        // Check if user exists in the Customers collection
        const user = await req.app.locals.usersDb.collection('Customers').findOne({ username });

        if (user) {
            // Calculate the ppd increment based on the plan
            const ppdIncrement = plans[plan] || 0; // Default to 0 if plan is not found in the dictionary

            // User exists, update the 'ppd' field and current investment
            await req.app.locals.usersDb.collection('Customers').updateOne(
                { username },
                {
                    $inc: {
                        ppd: ppdIncrement, // Increment 'ppd' according to the plan
                        currentInvest: amount // Increment currentInvest by the amount
                    },
                    $set: { plan } // Update the plan field
                }
            );
        } else {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({ message: 'Investment activated successfully', investmentId: investId });

    } else {
        return res.status(400).json({ message: 'Invalid status provided' });
    }
});


// Route for Logout
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Logout failed. Please try again later.' });
        }
        res.clearCookie('connect.sid'); 
        res.status(200).json({ message: 'Logout successful!' });
    });
});


// Dashboard Route (Protected)
router.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'dashboard.html'));
});

router.get('/pending-payments', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'pending-payments.html'));
});


module.exports = router;