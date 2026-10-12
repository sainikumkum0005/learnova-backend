const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ===============================
// GENERATE AUTH TOKEN
// ===============================
function generateToken(user) {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is missing from environment variables.");
    }

    return jwt.sign(
        {
            userId: user._id.toString(),
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d",
        }
    );
}

// ===============================
// REGISTER
// ===============================
router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required.",
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters.",
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existingUser = await User.findOne({
            email: normalizedEmail,
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
        });

        // Generate a token immediately after successful registration.
        const token = generateToken(user);

        return res.status(201).json({
            success: true,
            message: "Account created successfully.",
            token,
            user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                xp: user.xp,
                level: user.level,
                streak: user.streak,
                learningProfile: user.learningProfile ?? null,
            },
        });
    } catch (error) {
        console.error("Register error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Something went wrong while creating the account.",
        });
    }
});

// ===============================
// LOGIN
// ===============================
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const user = await User.findOne({
            email: normalizedEmail,
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        const token = generateToken(user);

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token,
            user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                xp: user.xp,
                level: user.level,
                streak: user.streak,
                learningProfile: user.learningProfile ?? null,
            },
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong while logging in.",
        });
    }
});

// ===============================
// GET CURRENT USER
// ===============================
router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        return res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error("Get user error:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong while fetching the user.",
        });
    }
});

// ===============================
// SAVE / UPDATE LEARNING PROFILE
// ===============================
router.put("/profile", authMiddleware, async (req, res) => {
    try {
        const { learningProfile } = req.body;

        if (
            !learningProfile ||
            typeof learningProfile !== "object" ||
            Array.isArray(learningProfile)
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid learning profile is required.",
            });
        }

        const requiredFields = [
            "title",
            "learningStyle",
            "strength",
            "motivation",
            "studyApproach",
        ];

        const hasMissingField = requiredFields.some((field) => {
            return (
                typeof learningProfile[field] !== "string" ||
                !learningProfile[field].trim()
            );
        });

        if (hasMissingField) {
            return res.status(400).json({
                success: false,
                message: "All learning profile fields are required.",
            });
        }

        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        user.learningProfile = {
            title: learningProfile.title.trim(),
            learningStyle: learningProfile.learningStyle.trim(),
            strength: learningProfile.strength.trim(),
            motivation: learningProfile.motivation.trim(),
            studyApproach: learningProfile.studyApproach.trim(),
        };

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Learning profile saved successfully.",
            learningProfile: user.learningProfile,
        });
    } catch (error) {
        console.error("Save learning profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong while saving your learning profile.",
        });
    }
});

module.exports = router;

