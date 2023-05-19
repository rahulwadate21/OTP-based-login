const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");

// Create an Express application
const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect("mongodb://127.0.0.1:27017/otplogin", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error);
  });

// Define the User schema
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  otp: String,
  otpExpiration: Date,
  loginAttempts: {
    type: Number,
    default: 0,
  },
  loginBlockedUntil: Date,
});

const User = mongoose.model("User", userSchema);

//  Nodemailer for sending emails
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "tempemail2104@gmail.com",
    pass: "iadamzxkypshfoec",
  },
});

// Generate a random OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP to the user's email
function sendOTP(email, otp) {
  const mailOptions = {
    from: "tempemail2104@gmail.com",
    to: email,
    subject: "OTP for Login",
    text: `Your OTP for login is: ${otp}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Failed to send OTP:", error);
    } else {
      console.log("OTP sent:", info.response);
    }
  });
}

// Generate OTP API
app.post("/generate_otp", async (req, res) => {
  const email = req.body.email;

  if (!email) {
    return res.status(400).json({ error: "Email address not provided." });
  }

  try {
    // Check if there is an existing user with the provided email
    const user = await User.findOne({ email });

    // Check if the user account is blocked
    if (user && user.loginBlockedUntil && user.loginBlockedUntil > Date.now()) {
      return res
        .status(403)
        .json({ error: "Account blocked. Try again after 1 hour." });
    }

    const currentTime = new Date();

    // Check if there is an existing OTP for the user
    if (user && user.otpExpiration && user.otpExpiration > currentTime) {
      return res
        .status(429)
        .json({ error: "OTP already generated. Try again after it expires." });
    }

    // Check if there was a recent OTP generation attempt
    if (user && user.otpExpiration && currentTime - user.otpExpiration < 1000) {
      return res
        .status(429)
        .json({ error: "Minimum 1 minute gap required between OTP requests." });
    }

    // Generate a new OTP and set its expiration time
    const otp = generateOTP();
    const otpExpiration = new Date(currentTime.getTime() + 1 * 1000);

    // Save the OTP and its expiration time for the user
    await User.updateOne({ email }, { otp, otpExpiration }, { upsert: true });
    console.log("User Email: " + email + " OTP: " + otp);
    // Send the OTP to the user's email
    sendOTP(email, otp);

    res.json({ message: "OTP sent successfully." });
  } catch (error) {
    console.error("Failed to generate OTP:", error);
    res.status(500).json({ error: "Failed to generate OTP." });
  }
});

// Login API
app.post("/login", async (req, res) => {
  const email = req.body.email;
  const otp = req.body.otp;

  if (!email || !otp) {
    return res
      .status(400)
      .json({ error: "Email address or OTP not provided." });
  }

  try {
    // Find the user with the provided email and OTP
    const user = await User.findOne({ email, otp });

    if (!user) {
      // Increment the login attempts count for the user
      await User.updateOne(
        { email },
        { $inc: { loginAttempts: 1 } },
        { upsert: true }
      );

      // Block the user if there are 5 failed login attempts
      if (user && user.loginAttempts >= 4) {
        const blockedUntil = new Date(Date.now() + 3600000); // Block for 1 hour
        await User.updateOne(
          { email },
          { loginAttempts: 0, loginBlockedUntil: blockedUntil }
        );

        return res
          .status(403)
          .json({ error: "Account blocked. Try again after 1 hour." });
      }

      return res.status(401).json({ error: "Invalid OTP." });
    }

    // Delete the OTP and reset login attempts for the user
    await User.updateOne(
      { email },
      { otp:"", otpExpiration: null, loginAttempts: 0 }
    );

    // Generate and return a new JWT token for the authenticated user
    const token = generateToken(email);
    console.log("JWT token is " + token);

    res.json({ message: " Logged in successfully..." + "****Your JWT TOKEN IS ****" + token });
  } catch (error) {
    console.error("Failed to authenticate user:", error);
    res.status(500).json({ error: "Failed to authenticate user." });
  }
});

// Generate JWT token
const generateToken = (email) => {
  const secretKey = "rahul"; 
  const token = jwt.sign({ email }, secretKey, { expiresIn: "1h" });
  console.log("JWT token is " + token);
  return token;
};

// Start the server
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
