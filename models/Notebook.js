const mongoose = require("mongoose");

const notebookSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        subject: {
            type: String,
            required: true,
            trim: true,
        },

        syllabus: {
            type: String,
            required: true,
            trim: true,
        },

        goal: {
            type: String,
            required: true,
            trim: true,
        },

        sources: {
            type: [String],
            default: [],
        },

        learningPath: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        completedTopics: {
            type: [String],
            default: [],
        },

        isArchived: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Notebook", notebookSchema);