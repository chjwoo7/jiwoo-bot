import pool from '../db.js';

/**
 * Create a new CTF event in the database
 */
export async function createEvent(eventData) {
    const { discordEventId, eventName, eventSlug, roleId, channelId, startTime, endTime } = eventData;

    const query = `
        INSERT INTO ctf_events (discord_event_id, event_name, event_slug, role_id, channel_id, start_time, end_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
    `;

    const values = [discordEventId, eventName, eventSlug, roleId, channelId, startTime, endTime];
    const result = await pool.query(query, values);

    return result.rows[0].id;
}

/**
 * Get event by Discord event ID
 */
export async function getEventByDiscordId(discordEventId) {
    const query = 'SELECT * FROM ctf_events WHERE discord_event_id = $1';
    const result = await pool.query(query, [discordEventId]);

    return result.rows[0] || null;
}

/**
 * Add participant to an event (or reactivate if they left before)
 */
export async function addParticipant(eventId, userId, username) {
    const query = `
        INSERT INTO event_participants (event_id, user_id, username, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (event_id, user_id) 
        DO UPDATE SET status = 'active', left_at = NULL
        RETURNING id
    `;

    const result = await pool.query(query, [eventId, userId, username]);
    return result.rows[0]?.id || null;
}

/**
 * Mark participant as left (instead of deleting)
 */
export async function removeParticipant(eventId, userId) {
    const query = `
        UPDATE event_participants
        SET status = 'left', left_at = CURRENT_TIMESTAMP
        WHERE event_id = $1 AND user_id = $2
    `;
    await pool.query(query, [eventId, userId]);
}

/**
 * Get all participants for an event
 * @param {number} eventId - Event ID
 * @param {boolean} includeLeft - Include participants who left (default: false)
 */
export async function getParticipants(eventId, includeLeft = false) {
    let query = `
        SELECT user_id, username, status, joined_at, left_at
        FROM event_participants
        WHERE event_id = $1
    `;

    if (!includeLeft) {
        query += ` AND status = 'active'`;
    }

    query += ` ORDER BY joined_at ASC`;

    const result = await pool.query(query, [eventId]);
    return result.rows;
}

/**
 * Mark event as archived
 */
export async function archiveEvent(eventId) {
    const query = `
        UPDATE ctf_events
        SET is_active = false, archived_at = CURRENT_TIMESTAMP
        WHERE id = $1
    `;

    await pool.query(query, [eventId]);
}

/**
 * Get all active events
 */
export async function getActiveEvents() {
    const query = 'SELECT * FROM ctf_events WHERE is_active = true ORDER BY start_time ASC';
    const result = await pool.query(query);

    return result.rows;
}
