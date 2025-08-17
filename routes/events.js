import express from "express";

// Import user-facing functions from the correct controller file
import { eventRegistration, accessingquizroom, accessingquizroombykey } from "../controllers/eventRegistrationController.js";

// Import the new admin-facing functions from eventController.js
import { getAllRegistrations, updateRegistration, deleteRegistration } from "../controllers/eventController.js";

// Import the admin authentication middleware
import { authenticate_admin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public routes for event registration and quiz access
router.post('/eventRegistration', eventRegistration);
router.post('/accessingquizroom', accessingquizroom);
router.post("/accessingquizroombykey", accessingquizroombykey);

// ------------------------------------------------------------------
// ADMIN-SPECIFIC ROUTES FOR EVENT MANAGEMENT (PROTECTED)
// ------------------------------------------------------------------

// Route to get all event registrations for the admin panel
router.get('/all-registrations', authenticate_admin, getAllRegistrations);

// Route to update a specific team's registration details
router.put('/update-registration/:teamleaderid', authenticate_admin, updateRegistration);

// Route to delete a specific team's registration
router.delete('/delete-registration/:teamleaderid', authenticate_admin, deleteRegistration);

export default router;