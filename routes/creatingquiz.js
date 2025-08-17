// routes/creatingquiz.js
import express from 'express';
// import { mongoDb } from '../config.js';
import { ObjectId } from 'mongodb'; // Make sure ObjectId is imported

const router = express.Router();

router.post('/setQuizNameToFile', async (req, res) => {
    const { name, total_rounds, has_buzzer_round, round_questions } = req.body;
    const author_id = req.user.id;

    try {
        if (!name) return res.status(400).json({ message: 'Quiz name is required' });
        if (!author_id) return res.status(401).json({ message: 'Unauthorized: User not authenticated or ID missing' }); // Use 401 for unauthorized

        const existingQuiz = await mongoDb.collection('quizzes').findOne({ name, author_id: author_id });

        let quizId;
        if (existingQuiz) {
            await mongoDb.collection('quizzes').updateOne(
                { _id: existingQuiz._id },
                {
                    $set: {
                        total_rounds: total_rounds || 1,
                        has_buzzer_round: has_buzzer_round || false,
                        round_questions: round_questions || {},
                        updated_at: new Date()
                    }
                }
            );
            quizId = existingQuiz._id;
            res.status(200).json({ message: 'Quiz configuration updated successfully', quiz_id: quizId });
        } else {
            const result = await mongoDb.collection('quizzes').insertOne({
                name,
                author_id: author_id,
                status: 'pending',
                total_rounds: total_rounds || 1,
                has_buzzer_round: has_buzzer_round || false,
                round_questions: round_questions || {},
                created_at: new Date(),
                updated_at: new Date()
            });
            quizId = result.insertedId;
            res.status(200).json({ message: 'Quiz created successfully', quiz_id: quizId });
        }

    } catch (error) {
        console.error('Error setting/creating quiz configuration:', error);
        res.status(500).json({ error: 'Failed to set quiz configuration', details: error.message });
    }
});


router.get('/questionsForQuiz', async (req, res) => {
    const { name } = req.query;
    try {
        const quiz = await mongoDb.collection('quizzes').findOne({ name });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        const questions = await mongoDb.collection('questions').find({ quiz_id: quiz._id }).toArray();

        const questionsWithBuzzerStatus = questions.map(q => ({
            ...q,
            is_buzzer_round: quiz.round_questions[`round${q.round_number}`]?.is_buzzer_round || false
        }));

        res.json(questionsWithBuzzerStatus);
    } catch (error) {
        console.error('Error fetching questions for quiz:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});


router.get('/nextQuestionIndex', async (req, res) => {
    // IMPORTANT: Frontend now sends `quiz_id` not `quiz_name` for nextQuestionIndex
    const { quiz_id, round } = req.query; // Changed from quiz_name to quiz_id
    try {
        if (!quiz_id) return res.status(400).json({ error: 'Quiz ID is required' }); // Added validation
        const quiz = await mongoDb.collection('quizzes').findOne({ _id: new ObjectId(quiz_id) }); // Find by _id
        if (!quiz) return res.status(404).json({ error: 'Quiz not found for the given ID' });
        const count = await mongoDb.collection('questions').countDocuments({ quiz_id: quiz._id, round_number: parseInt(round) });
        res.json({ nextIndex: count + 1 });
    } catch (error) {
        console.error('Error fetching next question index:', error);
        res.status(500).json({ error: 'Failed to fetch next index', details: error.message });
    }
});

router.post('/addQuestion', async (req, res) => {
    // IMPORTANT: Now expecting quiz_id from frontend instead of quiz_name for direct lookup
    const {
        quiz_id, // NEW: Expect quiz_id from frontend
        round_number,
        index,
        question,
        questionType,
        answer, // This will be stringified array or string
        description,
        marks,
        negative_marks,
        skip_marks,
        is_buzzer_round,
        file_type, // for media URL
        image // for media URL
    } = req.body;

    try {
        if (!quiz_id) return res.status(400).json({ error: 'Quiz ID is required' });
        if (!question || !question.trim()) return res.status(400).json({ error: 'Question text is required' });
        if (!round_number) return res.status(400).json({ error: 'Round number is required' });
        if (!index) return res.status(400).json({ error: 'Question index is required' });

        // Parse stringified answer and options from FormData
        let parsedAnswer;
        try {
            parsedAnswer = JSON.parse(answer);
        } catch (e) {
            console.error("Error parsing answer:", e);
            return res.status(400).json({ error: 'Invalid answer format' });
        }

        // We assume options are also sent as a JSON string under 'options' key
        let parsedOptions = [];
        if (req.body.options) {
            try {
                parsedOptions = JSON.parse(req.body.options);
            } catch (e) {
                console.error("Error parsing options:", e);
                return res.status(400).json({ error: 'Invalid options format' });
            }
        }


        // Find the quiz by its _id
        const quiz = await mongoDb.collection('quizzes').findOne({ _id: new ObjectId(quiz_id) });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found for the given ID' });


        const questionData = {
            quiz_id: quiz._id,
            quizname: quiz.name, // Get quizname from the found quiz document
            round_number: parseInt(round_number),
            index: parseInt(index),
            question,
            type: questionType,
            options: parsedOptions, // Use parsed options
            answer: parsedAnswer,   // Use parsed answer
            description: description || null,
            media: file_type ? { type: file_type, url: image || '' } : null,
            marks: parseInt(marks) || 0,
            negative_marks: parseInt(negative_marks) || 0,
            skip_marks: parseFloat(skip_marks) || 0,
            is_buzzer_round: is_buzzer_round === 'true', // Convert boolean string to boolean
            created_at: new Date()
        };

        // Check for existing question with same round and index to avoid duplicates
        const existingQuestion = await mongoDb.collection('questions').findOne({
            quiz_id: quiz._id,
            round_number: questionData.round_number,
            index: questionData.index
        });

        if (existingQuestion) {
            return res.status(409).json({ error: `Question with index ${questionData.index} already exists in Round ${questionData.round_number}.` });
        }

        const result = await mongoDb.collection('questions').insertOne(questionData);
        res.status(200).json({ message: 'Question added successfully', question_id: result.insertedId, nextIndex: questionData.index + 1 });

    } catch (error) {
        console.error('Error adding question:', error);
        res.status(500).json({ error: 'Failed to add question', details: error.message });
    }
});


router.put('/updateQuestion/:id', async (req, res) => {
    const questionId = req.params.id; // Get question ID from URL parameters
    const {
        quiz_id, // Expect quiz_id for security and correct lookup
        round_number,
        index,
        question,
        questionType,
        answer,
        description,
        marks,
        negative_marks,
        skip_marks,
        is_buzzer_round,
        file_type,
        image_url
    } = req.body;

    try {
        if (!questionId) return res.status(400).json({ error: "Question ID is required for update." });
        if (!quiz_id) return res.status(400).json({ error: 'Quiz ID is required' });


        const quiz = await mongoDb.collection('quizzes').findOne({ _id: new ObjectId(quiz_id) });
        if (!quiz) return res.status(404).json({ error: 'Quiz not found for the given ID' });

        let parsedAnswer;
        try {
            parsedAnswer = JSON.parse(answer); // Parse stringified answer
        } catch (e) {
            console.error("Error parsing answer for update:", e);
            return res.status(400).json({ error: 'Invalid answer format for update' });
        }

        let parsedOptions = [];
        if (req.body.options) {
            try {
                parsedOptions = JSON.parse(req.body.options); // Parse stringified options
            } catch (e) {
                console.error("Error parsing options for update:", e);
                return res.status(400).json({ error: 'Invalid options format for update' });
            }
        }


        const updateDoc = {
            $set: {
                question: question || '', // Ensure no undefined
                round_number: parseInt(round_number) || 0,
                index: parseInt(index) || 0,
                type: questionType || '',
                description: description || null,
                marks: parseInt(marks) || 0,
                negative_marks: parseInt(negative_marks) || 0,
                skip_marks: parseFloat(skip_marks) || 0,
                is_buzzer_round: is_buzzer_round === 'true', // Convert boolean string to boolean
                options: parsedOptions,
                answer: parsedAnswer,
                updated_at: new Date()
            }
        };

        if (file_type) {
            updateDoc.$set.media = { type: file_type, url: image_url || '' };
        } else if (req.body.media === null || req.body.media === 'null') { // Check for explicit null/string 'null' to clear media
            updateDoc.$set.media = null;
        }

        const result = await mongoDb.collection('questions').updateOne(
            { _id: new ObjectId(questionId), quiz_id: quiz._id },
            updateDoc
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Question not found or does not belong to this quiz." });
        }
        res.status(200).json({ message: 'Question updated successfully' });

    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({ error: 'Failed to update question', details: error.message });
    }
});


export default router;