const express = require("express");
const mongoose = require("mongoose");

const Notebook = require("../models/Notebook");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
const User = require("../models/User");

// ==========================================
// CREATE NOTEBOOK
// POST /api/notebooks
// ==========================================

router.post("/", authMiddleware, async (req, res) => {
    try {
        const { subject, syllabus, goal, sources } = req.body;

        if (
            typeof subject !== "string" ||
            !subject.trim() ||
            typeof syllabus !== "string" ||
            !syllabus.trim() ||
            typeof goal !== "string" ||
            !goal.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Subject, syllabus and goal are required.",
            });
        }

        if (
            sources !== undefined &&
            (!Array.isArray(sources) ||
                !sources.every(
                    (source) =>
                        typeof source === "string" &&
                        source.trim().length > 0
                ))
        ) {
            return res.status(400).json({
                success: false,
                message: "Sources must be a list of non-empty strings.",
            });
        }

        const notebook = await Notebook.create({
            userId: req.userId,
            subject: subject.trim(),
            syllabus: syllabus.trim(),
            goal: goal.trim(),
            sources: (sources || []).map((source) => source.trim()),
        });

        return res.status(201).json({
            success: true,
            message: "Notebook created successfully!",
            notebook,
        });
    } catch (error) {
        console.error("Create notebook error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to create notebook.",
        });
    }
});


// ==========================================
// GET ALL NOTEBOOKS FOR LOGGED-IN USER
// GET /api/notebooks
// ==========================================

router.get("/", authMiddleware, async (req, res) => {
    try {
        const notebooks = await Notebook.find({
            userId: req.userId,
        }).sort({ updatedAt: -1 });

        return res.status(200).json({
            success: true,
            count: notebooks.length,
            notebooks,
        });
    } catch (error) {
        console.error("Fetch notebooks error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch notebooks.",
        });
    }
});


// ==========================================
// GET SINGLE NOTEBOOK
// GET /api/notebooks/:id
// ==========================================

router.get("/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid notebook ID.",
            });
        }

        const notebook = await Notebook.findOne({
            _id: id,
            userId: req.userId,
        });

        if (!notebook) {
            return res.status(404).json({
                success: false,
                message: "Notebook not found.",
            });
        }

        return res.status(200).json({
            success: true,
            notebook,
        });
    } catch (error) {
        console.error("Fetch notebook error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch notebook.",
        });
    }
});


// ==========================================
// UPDATE NOTEBOOK
// PUT /api/notebooks/:id
// ==========================================

router.put("/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid notebook ID.",
            });
        }

        const allowedFields = [
            "subject",
            "syllabus",
            "goal",
            "sources",
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one field to update.",
            });
        }

        for (const field of ["subject", "syllabus", "goal"]) {
            if (field in updates) {
                if (
                    typeof updates[field] !== "string" ||
                    !updates[field].trim()
                ) {
                    return res.status(400).json({
                        success: false,
                        message: `${field} must be a non-empty string.`,
                    });
                }

                updates[field] = updates[field].trim();
            }
        }

        if ("sources" in updates) {
            if (
                !Array.isArray(updates.sources) ||
                !updates.sources.every(
                    (source) =>
                        typeof source === "string" &&
                        source.trim().length > 0
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Sources must be a list of non-empty strings.",
                });
            }

            updates.sources = updates.sources.map((source) =>
                source.trim()
            );
        }

        const notebook = await Notebook.findOneAndUpdate(
            {
                _id: id,
                userId: req.userId,
            },
            { $set: updates },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!notebook) {
            return res.status(404).json({
                success: false,
                message: "Notebook not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notebook updated successfully!",
            notebook,
        });
    } catch (error) {
        console.error("Update notebook error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to update notebook.",
        });
    }
});


// ==========================================
// DELETE NOTEBOOK
// DELETE /api/notebooks/:id
// ==========================================

router.delete("/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid notebook ID.",
            });
        }

        const notebook = await Notebook.findOneAndDelete({
            _id: id,
            userId: req.userId,
        });

        if (!notebook) {
            return res.status(404).json({
                success: false,
                message: "Notebook not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notebook deleted successfully!",
        });
    } catch (error) {
        console.error("Delete notebook error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to delete notebook.",
        });
    }
});
// ==========================================
// COMPLETE A TOPIC AND AWARD XP
// POST /api/notebooks/:id/topics/:topicId/complete
// ==========================================

router.post("/:id/topics/:topicId/complete", authMiddleware, async (req, res) => {
    try {
        const { id, topicId } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid notebook ID.",
            });
        }

        if (!topicId || topicId.length > 200) {
            return res.status(400).json({
                success: false,
                message: "Invalid topic ID.",
            });
        }

        // Only allow access to the logged-in user's notebook.
        const notebook = await Notebook.findOne({
            _id: id,
            userId: req.userId,
            isArchived: false,
        });

        if (!notebook) {
            return res.status(404).json({
                success: false,
                message: "Notebook not found.",
            });
        }

        const learningPath = notebook.learningPath;

        if (
            !learningPath ||
            !Array.isArray(learningPath.modules)
        ) {
            return res.status(400).json({
                success: false,
                message: "Generate a learning path before completing topics.",
            });
        }

        // Confirm that this topic belongs to this notebook.
        let matchedTopic = null;

        for (const module of learningPath.modules) {
            if (!Array.isArray(module.topics)) continue;

            matchedTopic = module.topics.find(
                (topic) => String(topic.id) === topicId
            );

            if (matchedTopic) break;
        }

        if (!matchedTopic) {
            return res.status(404).json({
                success: false,
                message: "Topic not found in this learning path.",
            });
        }

        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found.",
            });
        }

        // Never award XP twice for the same topic.
        if (notebook.completedTopics.includes(topicId)) {
            return res.status(200).json({
                success: true,
                message: "This topic is already completed.",
                alreadyCompleted: true,
                xpAwarded: 0,
                xp: user.xp,
                level: user.level,
                completedTopics: notebook.completedTopics,
            });
        }

        const XP_PER_TOPIC = 20;

        notebook.completedTopics.push(topicId);

        // Update the topic status in the saved learning path too.
        matchedTopic.completed = true;

        notebook.markModified("learningPath");

        const newXp = Math.max(0, user.xp || 0) + XP_PER_TOPIC;

        // Every 100 XP advances one level.
        const newLevel = Math.floor(newXp / 100) + 1;

        user.xp = newXp;
        user.level = newLevel;

        await notebook.save();
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Topic completed! Keep up the great work!",
            alreadyCompleted: false,
            xpAwarded: XP_PER_TOPIC,
            xp: user.xp,
            level: user.level,
            completedTopics: notebook.completedTopics,
        });
    } catch (error) {
        console.error("Topic completion error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to complete this topic right now.",
        });
    }
});


module.exports = router;