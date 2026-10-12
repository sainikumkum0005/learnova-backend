const express = require("express");
const mongoose = require("mongoose");

const { generateAIResponse } = require("../services/aiService");
const authMiddleware = require("../middleware/authMiddleware");
const Notebook = require("../models/Notebook");
const User = require("../models/User");

const router = express.Router();

// ==========================================
// TEST REAL AI CONNECTION
// POST /api/ai/test
// ==========================================
router.post("/test", authMiddleware, async (req, res) => {
    try {
        const { prompt } = req.body;

        if (typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a prompt.",
            });
        }

        const answer = await generateAIResponse({
            systemPrompt:
                "You are Learnova AI, a friendly and helpful learning assistant. Explain concepts clearly and accurately for students.",
            userPrompt: prompt.trim(),
            temperature: 0.7,
        });

        return res.status(200).json({
            success: true,
            message: "Learnova AI is connected!",
            answer,
        });
    } catch (error) {
        console.error(
            "AI test error:",
            error.response?.data || error.message
        );

        return res.status(502).json({
            success: false,
            message: "AI request failed. Check the backend logs.",
        });
    }
});

// ==========================================
// GENERATE PERSONALIZED AI LEARNING PROFILE
// POST /api/ai/learning-profile
// ==========================================
router.post("/learning-profile", authMiddleware, async (req, res) => {
    try {
        const { answers } = req.body;

        // Validate questionnaire answers.
        if (
            !answers ||
            typeof answers !== "object" ||
            Array.isArray(answers)
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid questionnaire answers are required.",
            });
        }

        // Expect all 8 questionnaire questions to be answered.
        const answerEntries = Object.entries(answers);

        if (
            answerEntries.length !== 8 ||
            answerEntries.some(([key, value]) => {
                const index = Number(key);

                return (
                    !Number.isInteger(index) ||
                    index < 0 ||
                    index > 7 ||
                    !Array.isArray(value) ||
                    value.length === 0 ||
                    value.some(
                        (answer) =>
                            typeof answer !== "string" ||
                            !answer.trim()
                    )
                );
            })
        ) {
            return res.status(400).json({
                success: false,
                message: "Please complete all 8 questionnaire questions.",
            });
        }

        // Find the authenticated user.
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found.",
            });
        }

        // Convert the answers into readable context for the AI.
        const formattedAnswers = answerEntries
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([questionIndex, selectedAnswers]) => ({
                questionNumber: Number(questionIndex) + 1,
                selectedAnswers: selectedAnswers.map((answer) =>
                    answer.trim().slice(0, 500)
                ),
            }));

        const systemPrompt = `
You are Learnova's personalized learning profile analyst.

Your task is to analyze a student's questionnaire responses and create
a useful, realistic learning profile.

IMPORTANT RULES:
1. Base observations on the supplied answers.
2. Do not invent information about the student.
3. Do not claim to measure intelligence, diagnose conditions, or identify
   a scientifically established brain type.
4. Treat learning preferences as preferences, not fixed abilities.
5. Recommend practical ways to learn, practice, and revise.
6. If evidence is limited, acknowledge uncertainty instead of guessing.
7. Avoid generic praise and repetitive descriptions.
8. Return valid JSON only. Do not use Markdown fences.

Return this exact JSON structure:
{
  "title": "A concise personalized learning identity",
  "description": "A personalized summary based on the responses",
  "learningStyle": "Preferred learning methods supported by the answers",
  "strength": "A potential strength or useful learning habit",
  "motivation": "The student's stated goal or motivation",
  "studyApproach": "A practical recommended study strategy",
  "learningPreferences": [
    "A supported learning preference"
  ],
  "recommendedActivities": [
    "A specific learning activity"
  ],
  "insight": "A useful observation grounded in the responses"
}

Include 2-4 learning preferences and 3-5 recommended activities.
Keep the language friendly, specific, and understandable.
        `.trim();

        const userPrompt = `
Create a personalized Learnova Learning Profile using these questionnaire
responses.

STUDENT NAME:
${user.name}

QUESTIONNAIRE RESPONSES:
${JSON.stringify(formattedAnswers, null, 2)}

Analyze the student's stated preferences, approaches to problem-solving,
study habits, goals, and motivations where the responses support this.

Generate the profile using the required JSON structure.
        `.trim();

        const rawAnswer = await generateAIResponse({
            systemPrompt,
            userPrompt,
            temperature: 0.4,
        });

        // Parse the AI response.
        const cleanedAnswer = rawAnswer
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "");

        let profile;

        try {
            profile = JSON.parse(cleanedAnswer);
        } catch (parseError) {
            console.error(
                "AI learning profile JSON parsing failed:",
                parseError.message
            );

            return res.status(502).json({
                success: false,
                message:
                    "AI returned an invalid learning profile. Please try again.",
            });
        }

        // Validate the required fields.
        const requiredFields = [
            "title",
            "description",
            "learningStyle",
            "strength",
            "motivation",
            "studyApproach",
            "insight",
        ];

        const hasInvalidFields =
            !profile ||
            typeof profile !== "object" ||
            requiredFields.some(
                (field) =>
                    typeof profile[field] !== "string" ||
                    !profile[field].trim()
            ) ||
            !Array.isArray(profile.learningPreferences) ||
            !Array.isArray(profile.recommendedActivities) ||
            !profile.learningPreferences.every(
                (item) => typeof item === "string"
            ) ||
            !profile.recommendedActivities.every(
                (item) => typeof item === "string"
            );

        if (hasInvalidFields) {
            return res.status(502).json({
                success: false,
                message:
                    "AI returned an incomplete learning profile. Please try again.",
            });
        }

        // Save the generated profile to MongoDB.
        // The existing Mixed schema supports these additional fields.
        user.learningProfile = {
            title: profile.title.trim(),
            description: profile.description.trim(),
            learningStyle: profile.learningStyle.trim(),
            strength: profile.strength.trim(),
            motivation: profile.motivation.trim(),
            studyApproach: profile.studyApproach.trim(),
            learningPreferences: profile.learningPreferences,
            recommendedActivities: profile.recommendedActivities,
            insight: profile.insight.trim(),
            generatedAt: new Date(),
        };

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Your personalized AI learning profile is ready!",
            learningProfile: user.learningProfile,
        });
    } catch (error) {
        console.error(
            "AI learning profile generation error:",
            error.response?.data || error.message
        );

        return res.status(502).json({
            success: false,
            message:
                "Unable to generate your learning profile right now. Please try again.",
        });
    }
});

// ==========================================
// GENERATE AI LESSON FOR A TOPIC
// POST /api/ai/lesson
// ==========================================
router.post("/lesson", authMiddleware, async (req, res) => {
    try {
        const {
            notebookId,
            topicTitle,
            topicDescription,
            learningGoal,
        } = req.body;

        if (
            !mongoose.isValidObjectId(notebookId) ||
            typeof topicTitle !== "string" ||
            !topicTitle.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid notebook ID and topic title are required.",
            });
        }

        const notebook = await Notebook.findOne({
            _id: notebookId,
            userId: req.userId,
            isArchived: false,
        });

        if (!notebook) {
            return res.status(404).json({
                success: false,
                message: "Notebook not found.",
            });
        }

        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found.",
            });
        }

        const profile = user.learningProfile || {};

        const systemPrompt = `
You are Learnova AI Tutor, a patient and effective personal teacher.

Teach the student the requested topic using clear, accurate explanations.

Adapt your teaching to the student's learning profile when information is available.

Return valid JSON only, with this exact structure:
{
  "title": "Topic title",
  "introduction": "A friendly introduction",
  "sections": [
    {
      "heading": "Section heading",
      "explanation": "Detailed but easy-to-understand explanation",
      "example": "A useful example"
    }
  ],
  "keyTakeaways": [
    "Important takeaway"
  ],
  "practiceQuestions": [
    {
      "question": "Question for the student",
      "answer": "Correct answer",
      "explanation": "Why this answer is correct"
    }
  ]
}

Include 3-5 useful sections and 3 practice questions.
Make the lesson educational, specific, and relevant to the topic.
Do not invent facts. Do not use Markdown fences.
        `.trim();

        const userPrompt = `
NOTEBOOK SUBJECT: ${notebook.subject}

SYLLABUS:
${notebook.syllabus}

STUDENT GOAL:
${learningGoal || notebook.goal}

TOPIC:
${topicTitle.trim()}

TOPIC DESCRIPTION:
${typeof topicDescription === "string"
    ? topicDescription
    : "Explain the topic from its fundamentals."}

STUDY SOURCES:
${(notebook.sources || []).join("\n") || "No additional sources."}

LEARNING PROFILE:
${JSON.stringify({
    title: profile.title || "Not specified",
    learningStyle: profile.learningStyle || "Not specified",
    strength: profile.strength || "Not specified",
    motivation: profile.motivation || "Not specified",
    studyApproach: profile.studyApproach || "Not specified",
}, null, 2)}

Generate a complete lesson for this topic.
        `.trim();

        const rawAnswer = await generateAIResponse({
            systemPrompt,
            userPrompt,
            temperature: 0.5,
        });

        const cleanedAnswer = rawAnswer
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();

        let lesson;

        try {
            lesson = JSON.parse(cleanedAnswer);
        } catch (error) {
            console.error("Lesson JSON parsing failed:", error.message);

            return res.status(502).json({
                success: false,
                message: "AI returned an invalid lesson. Please try again.",
            });
        }

        if (
            !lesson ||
            typeof lesson.title !== "string" ||
            !Array.isArray(lesson.sections) ||
            !Array.isArray(lesson.practiceQuestions)
        ) {
            return res.status(502).json({
                success: false,
                message: "AI returned an incomplete lesson.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Your AI lesson is ready!",
            lesson,
        });
    } catch (error) {
        console.error(
            "AI lesson generation error:",
            error.response?.data || error.message
        );

        return res.status(502).json({
            success: false,
            message: "Unable to generate this lesson right now.",
        });
    }
});
// ==========================================
// GENERATE PERSONALIZED LEARNING PATH
// POST /api/ai/learning-path/:notebookId
// ==========================================
router.post(
    "/learning-path/:notebookId",
    authMiddleware,
    async (req, res) => {
        try {
            const { notebookId } = req.params;

            if (!mongoose.isValidObjectId(notebookId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid notebook ID.",
                });
            }

            // Find only a notebook owned by the logged-in user.
            const notebook = await Notebook.findOne({
                _id: notebookId,
                userId: req.userId,
                isArchived: false,
            });

            if (!notebook) {
                return res.status(404).json({
                    success: false,
                    message: "Notebook not found.",
                });
            }

            // Fetch the user's saved learning profile.
            const user = await User.findById(req.userId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User account not found.",
                });
            }

            const profile = user.learningProfile || {};

            const profileContext = {
                title: profile.title || "Learning profile not available",
                learningStyle:
                    profile.learningStyle || "Not specified",
                strength: profile.strength || "Not specified",
                motivation: profile.motivation || "Not specified",
                studyApproach:
                    profile.studyApproach || "Not specified",
            };

            const userPrompt = `
Create a personalized learning path for this Learnova notebook.

NOTEBOOK INFORMATION
Subject: ${notebook.subject}
Syllabus:
${notebook.syllabus}

Student's goal:
${notebook.goal}

Study sources:
${notebook.sources.length
    ? notebook.sources.join("\n")
    : "No additional sources provided."}

STUDENT LEARNING PROFILE
${JSON.stringify(profileContext, null, 2)}

REQUIREMENTS
1. Cover the supplied syllabus without inventing unrelated units.
2. Organize the syllabus into a logical sequence of learning modules.
3. Give each module a clear title, explanation, and estimated duration.
4. Break each module into specific, actionable topics.
5. Explain what the student should be able to do after each module.
6. Include practice activities and revision checkpoints.
7. Adapt the learning recommendations to the student's goal and stated preferences when available.
8. If profile information is missing, use sensible general learning strategies.
9. Do not claim the student has mastered anything before completing it.
10. Return valid JSON only. Do not use Markdown fences.

Use this exact JSON structure:
{
  "title": "Learning path title",
  "subject": "Subject name",
  "goal": "Student's goal",
  "personalizationSummary": "How this plan is tailored",
  "estimatedDuration": "Estimated total duration",
  "modules": [
    {
      "id": "module-1",
      "title": "Module title",
      "description": "What the module covers",
      "estimatedDuration": "Estimated duration",
      "learningOutcomes": [
        "Learning outcome"
      ],
      "topics": [
        {
          "id": "topic-1",
          "title": "Topic title",
          "description": "What to learn",
          "estimatedDuration": "Estimated duration",
          "practiceActivity": "Suggested practice",
          "completed": false
        }
      ],
      "revisionCheckpoint": "How to revise and check understanding"
    }
  ]
}
`;

            const rawAnswer = await generateAIResponse({
                systemPrompt: `
You are Learnova's personalized curriculum planner.

Your job is to convert a student's actual syllabus into a useful, realistic
learning roadmap.

Respect the supplied syllabus and learning profile.
Never fabricate completed progress or claim guaranteed academic outcomes.
Return valid JSON only, following the exact structure requested by the user.
Do not wrap the JSON in Markdown fences.
                `.trim(),
                userPrompt,
                temperature: 0.4,
            });

            // Parse the AI response before saving it.
            let learningPath;

            try {
                const cleanedAnswer = rawAnswer
                    .trim()
                    .replace(/^```(?:json)?\s*/i, "")
                    .replace(/\s*```$/, "");

                learningPath = JSON.parse(cleanedAnswer);
            } catch (parseError) {
                console.error(
                    "Learning path JSON parsing failed:",
                    parseError.message
                );

                return res.status(502).json({
                    success: false,
                    message:
                        "AI returned an invalid learning path. Please try again.",
                });
            }

            // Basic structural validation.
            if (
                !learningPath ||
                typeof learningPath.title !== "string" ||
                !Array.isArray(learningPath.modules) ||
                learningPath.modules.length === 0
            ) {
                return res.status(502).json({
                    success: false,
                    message:
                        "AI returned an incomplete learning path. Please try again.",
                });
            }

            // Persist the generated path in MongoDB.
            notebook.learningPath = learningPath;
            await notebook.save();

            return res.status(200).json({
                success: true,
                message: "Your personalized learning path is ready!",
                learningPath,
            });
        } catch (error) {
            console.error(
                "Learning path generation error:",
                error.response?.data || error.message
            );

            return res.status(502).json({
                success: false,
                message:
                    "Unable to generate the learning path right now. Please try again.",
            });
        }
    }
);

// ==========================================
// GENERATE AI-POWERED TOPIC QUIZ
// POST /api/ai/quiz
// ==========================================
router.post("/quiz", authMiddleware, async (req, res) => {
    try {
        const { notebookId, topicTitle, topicDescription, learningGoal } =
            req.body;

        // Validate request.
        if (
            !mongoose.isValidObjectId(notebookId) ||
            typeof topicTitle !== "string" ||
            !topicTitle.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid notebook ID and topic title are required.",
            });
        }

        // Verify notebook ownership.
        const notebook = await Notebook.findOne({
            _id: notebookId,
            userId: req.userId,
            isArchived: false,
        });

        if (!notebook) {
            return res.status(404).json({
                success: false,
                message: "Notebook not found.",
            });
        }

        // Get the user's learning profile.
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found.",
            });
        }

        const profile = user.learningProfile || {};

        const systemPrompt = `
You are Learnova AI, an expert educational assessment designer.

Generate exactly 5 multiple-choice questions about the requested topic.

RULES:
1. Questions must test understanding, not just memorization.
2. Each question must have exactly four distinct options.
3. Exactly one option must be correct.
4. correctAnswerIndex must be an integer from 0 to 3.
5. Provide a clear explanation for the correct answer.
6. Use the student's learning preferences when relevant.
7. Questions must be accurate and appropriate to the topic.
8. Avoid ambiguous questions and trick questions.
9. Do not reveal the correct answer in the question or options themselves.
10. Return valid JSON only. Do not use Markdown fences.

Return this exact structure:
{
  "title": "Quiz title",
  "description": "Short quiz description",
  "questions": [
    {
      "id": "q1",
      "question": "Question text",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "correctAnswerIndex": 0,
      "explanation": "Explanation of the correct answer"
    }
  ]
}
        `.trim();

        const userPrompt = `
Create a 5-question educational quiz.

SUBJECT: ${notebook.subject}
TOPIC: ${topicTitle.trim()}
TOPIC DESCRIPTION:
${typeof topicDescription === "string"
    ? topicDescription.slice(0, 3000)
    : "Teach the topic from its fundamentals."}

STUDENT GOAL:
${typeof learningGoal === "string"
    ? learningGoal.slice(0, 1000)
    : notebook.goal}

LEARNING PROFILE:
${JSON.stringify({
    learningStyle: profile.learningStyle || "Not specified",
    studyApproach: profile.studyApproach || "Not specified",
    learningPreferences: profile.learningPreferences || [],
}, null, 2)}

Generate exactly five questions with four options each.
        `.trim();

        const rawAnswer = await generateAIResponse({
            systemPrompt,
            userPrompt,
            temperature: 0.3,
        });

        const cleanedAnswer = rawAnswer
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "");

        let quiz;

        try {
            quiz = JSON.parse(cleanedAnswer);
        } catch (error) {
            console.error("Quiz JSON parsing failed:", error.message);

            return res.status(502).json({
                success: false,
                message: "AI returned an invalid quiz. Please try again.",
            });
        }

        // Validate every question before returning it.
        const validQuiz =
            quiz &&
            typeof quiz.title === "string" &&
            Array.isArray(quiz.questions) &&
            quiz.questions.length === 5 &&
            quiz.questions.every((question, index) =>
                question &&
                typeof question.question === "string" &&
                question.question.trim().length > 0 &&
                Array.isArray(question.options) &&
                question.options.length === 4 &&
                question.options.every(
                    option =>
                        typeof option === "string" &&
                        option.trim().length > 0
                ) &&
                Number.isInteger(question.correctAnswerIndex) &&
                question.correctAnswerIndex >= 0 &&
                question.correctAnswerIndex <= 3 &&
                typeof question.explanation === "string" &&
                question.explanation.trim().length > 0
            );

        if (!validQuiz) {
            return res.status(502).json({
                success: false,
                message:
                    "AI returned an incomplete quiz. Please generate it again.",
            });
        }

        // The correct answers are intentionally included here for now.
        // Before releasing a production quiz, move answer validation to
        // a server-side submission endpoint so answers are not exposed
        // to clients before submission.
        return res.status(200).json({
            success: true,
            message: "Your AI quiz is ready!",
            quiz,
        });

    } catch (error) {
        console.error(
            "AI quiz generation error:",
            error.response?.data || error.message
        );

        return res.status(502).json({
            success: false,
            message: "Unable to generate your quiz right now.",
        });
    }
});

module.exports = router;