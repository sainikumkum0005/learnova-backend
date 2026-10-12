const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: true,
            minlength: 6,
        },

        learningProfile: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        xp: {
            type: Number,
            default: 0,
        },

        level: {
            type: Number,
            default: 1,
        },

        streak: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", userSchema);