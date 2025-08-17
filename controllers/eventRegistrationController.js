import { db } from "../config.js";
import { sendRegistrationSuccessEmail } from '../services/emailService.js';
import { createEvent, listEvents, getEventDetails,list_of_all_events } from '../services/eventService.js';

export const eventRegistration = async (req, res) => {
    const {
        teamLeaderName,
        teamLeaderId,
        leadMailId,
        teamName,
        members,
    } = req.body.data;

    // --- Core Validation: A team must have a leader and a name. ---
    if (!teamLeaderName || !teamLeaderId || !leadMailId || !teamName) {
        return res
            .status(400)
            .json({ message: "Team leader details and team name are required." });
    }

    try {
        const allMemberIds = [teamLeaderId, ...members.map(m => m.id)].filter((id) => id);

        const conflictCheckQuery = `
            SELECT teamname, leadmailid
            FROM eventregistration
            WHERE teamname = $1
                OR leadmailid = $2
                OR teamleaderid = ANY($3)
                OR members @> ANY($4)
        `;

        const membersJson = allMemberIds.map(id => ({ id }));
        const conflictResult = await db.query(conflictCheckQuery, [
            teamName,
            leadMailId,
            allMemberIds,
            membersJson
        ]);

        if (conflictResult.rows.length > 0) {
            const existing = conflictResult.rows[0];
            if (existing.teamname === teamName) {
                return res.status(409).json({ message: `Team name '${teamName}' is already taken.` });
            }
            if (existing.leadmailid === leadMailId) {
                return res.status(409).json({ message: `Email '${leadMailId}' is already registered.` });
            }
            return res.status(409).json({ message: "One or more team members are already registered in another team.",});
        }

        const insertQuery = `
            INSERT INTO eventregistration(
                teamleadername, teamleaderid, leadmailid, teamname, members
            ) VALUES ($1, $2, $3, $4, $5)
        `;
        
        await db.query(insertQuery, [
            teamLeaderName,
            teamLeaderId,
            leadMailId,
            teamName,
            JSON.stringify(members),
        ]);

        // --- NEW: Call the email service function after successful registration ---
        await sendRegistrationSuccessEmail({ teamLeaderName, teamLeaderId, leadMailId, teamName, members });

        res.status(201).json({ ok: true, message: "Team registered successfully!" });

    } catch (error) {
        console.error("Error during event registration:", error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
};

export const accessingquizroom = async (req, res) => {
  const { teamleademailid } = req.body.data;

  if (!teamleademailid) {
    return res.status(400).json({ message: "Team lead email is required." });
  }

  try {
    const result = await db.query(
      "SELECT timestamp FROM eventregistration WHERE leadmailid=$1",
      [teamleademailid]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "This email is not registered for the event." });
    }

    const lastRequestTimestamp = result.rows[0].timestamp;
    if (lastRequestTimestamp) {
      const timeDifference =
        (new Date() - new Date(lastRequestTimestamp)) / 1000 / 60;
      if (timeDifference <= 5) {
        const timeLeft = Math.ceil(5 - timeDifference);
        return res.status(429).json({
          message: `Please wait ${timeLeft} more minute(s) before requesting a new code.`,
        });
      }
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    await sendVerificationEmail(teamleademailid, otp);

    await db.query(
      "UPDATE eventregistration SET teamkey=$1, timestamp=$2 WHERE leadmailid=$3",
      [otp, new Date(), teamleademailid]
    );

    res
      .status(200)
      .json({ message: "A verification code has been sent to your email." });
  } catch (error) {
    console.error("Error in accessingquizroom:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

export const accessingquizroombykey = async (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ message: "Access key is required." });
  }

  try {
    const query = `
      SELECT * FROM eventregistration
      WHERE teamkey = $1 AND timestamp > NOW() - INTERVAL '5 minutes'
    `;
    const result = await db.query(query, [key]);

    if (result.rows.length > 0) {
      res.status(200).json({ teamData: result.rows[0] });
    } else {
      res.status(404).json({ message: "Invalid or expired access key." });
    }
  } catch (error) {
    console.error("Error accessing quiz room by key:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};