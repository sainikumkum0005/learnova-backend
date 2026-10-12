const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const aiRoutes = require("./routes/aiRoutes");
const notebookRoutes = require("./routes/notebookRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/notebooks", notebookRoutes);

// Health check
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Learnova Backend is running 🚀",
    });
});

// MongoDB connection
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("MongoDB connected successfully ✅");

        app.listen(PORT, () => {
            console.log(
                `Learnova backend running on http://localhost:${PORT}`
            );
        });
    })
    .catch((error) => {
        console.error("MongoDB connection failed ❌");
        console.error(error.message);
    });