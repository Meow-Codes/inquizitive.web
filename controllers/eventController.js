// Import necessary functions from the eventService module
import { createEvent, listEvents, getEventDetails, list_of_all_events } from '../services/eventService.js';
import { db } from "../config.js"; // You might need to add this import if it's not already there
import { sendPresenceAcknowledgedEmail } from '../services/emailService.js';

// Controller function to handle the creation of an event
export const create = async (req, res) => {
  try {
    const organizerId = req.user.id; // Get the organizer ID from the authenticated user
    console.log(req.user)
    const eventData = req.body; // Get event data from the request body
    const event = await createEvent(organizerId, eventData); // Create the event
    res.status(201).json({ message: 'Event created successfully.', event }); // Respond with success message and event data
  } catch (error) {
    res.status(400).json({ error: error.message }); // Respond with error message if creation fails
  }
};

export const listofallevents = async (req, res) => {
  try {
    const events = await list_of_all_events(); // Retrieve events based on filters, pagination
    res.status(200).json({ events }); // Respond with the list of events
  } catch (error) {
    res.status(400).json({ error: error.message }); // Respond with error message if listing fails
  }
};


// Controller function to list all events with optional filters and pagination
export const list = async (req, res) => {
  try {
    const filters = req.query; // Get filters from query parameters
    const events = await listEvents(filters); // Retrieve events based on filters, pagination
    res.status(200).json({ events }); // Respond with the list of events
  } catch (error) {
    res.status(400).json({ error: error.message }); // Respond with error message if listing fails
  }
};

// Controller function to get the details of a specific event by its ID
export const getDetails = async (req, res) => {
  try {
    const id = req.params.id; // Get event ID from route parameters
    const event = await getEventDetails(id); // Retrieve event details
    res.status(200).json({ event }); // Respond with event details
  } catch (error) {
    res.status(400).json({ error: error.message }); // Respond with error message if retrieval fails
  }
};

console.log("mahesh")

// --- NEW EVENT REGISTRATION MANAGEMENT FUNCTIONS ---

/**
 * Fetches all event registrations.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export const getAllRegistrations = async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM eventregistration ORDER BY teamname ASC");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching event registrations:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

/**
 * Updates a single event registration.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export const updateRegistration = async (req, res) => {
    const { teamleaderid } = req.params;
    const { teamname, is_present, has_taken_quiz } = req.body;

    try {
        // First, fetch the current registration data to check the old `is_present` value
        const oldDataResult = await db.query('SELECT * FROM eventregistration WHERE teamleaderid = $1', [teamleaderid]);
        if (oldDataResult.rows.length === 0) {
            return res.status(404).json({ message: "Registration not found." });
        }
        const oldIsPresentValue = oldDataResult.rows[0].is_present;
        const leadMailId = oldDataResult.rows[0].leadmailid;
        const teamName = oldDataResult.rows[0].teamname;

        const updateQuery = `
            UPDATE eventregistration
            SET teamname = $1,
                is_present = $2,
                has_taken_quiz = $3
            WHERE teamleaderid = $4
            RETURNING *;
        `;
        const result = await db.query(updateQuery, [teamname, is_present, has_taken_quiz, teamleaderid]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Registration not found." });
        }

        // --- NEW: Check if `is_present` was just set to true and send email ---
        if (is_present === true && oldIsPresentValue === false) {
            await sendPresenceAcknowledgedEmail(leadMailId, teamName);
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error("Error updating event registration:", error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
};

/**
 * Deletes a single event registration.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export const deleteRegistration = async (req, res) => {
  const { teamleaderid } = req.params;

  try {
    const result = await db.query("DELETE FROM eventregistration WHERE teamleaderid = $1 RETURNING teamleaderid;", [teamleaderid]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Registration not found." });
    }
    res.status(200).json({ message: "Registration deleted successfully." });
  } catch (error) {
    console.error("Error deleting event registration:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

//ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAII8HpMHyEjOI/mVbZ2/yV8RXVniBrYTVcqQ8TRAjnz7I inquizitive@iiitdwd.ac.in