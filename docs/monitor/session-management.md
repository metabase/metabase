---
title: Session management tools
summary: View and revoke specific sessions or all sessions.
---

# Session management tools

{% include plans-blockquote.html feature="Session management" %} 

Admins can use session management to see who's signed in to your Metabase, and sign people out if necessary.

To open the session management tools:

1. Open [Monitor](./start.md).
2. In the left sidebar, click **Session management** under the **Logs and activity** heading.

## View and filter sessions

Session management tabs include: **Active** and **Ended**.

Ended sessions are kept for 30 days and show the reason for why they ended (like a timeout or an admin revoking the session).

For active sessions, the table of sessions contains columns for user, device, auth method, and time they signed in. For ended sessions, the columns are user, device, signed in, ended, and reason.

Click the User, Signed in, or Auth Method headings to sort the table by that column. Click a session in the table to see its details in a sidebar:

- User
- Email
- Auth method
- Session type
- Device
- User agent
- IP address
- Device ID
- Signed in
- Last active
- Expires
- Ended (for ended sessions)
- Reason (for ended sessions)

Search for individual sessions by name or email with the search field. The filter button on the right lets you filter by authentication method and the time window when the session was last active. Click **Apply** to apply the filter or **Clear filters** to clear all filters.

## Revoke sessions to sign people out

Revoking a session signs that person out immediately. You can revoke individual sessions, or bulk-revoke a selection of sessions or all active sessions.

- **One session**: Click the session, then click **Revoke session**.
- **All of one person's sessions**: Click any of their sessions, then click **Revoke active sessions**. They'll be signed out everywhere.
- **Several sessions**: Select the sessions in the table, then click **Revoke**.
- **Everyone**: Click **Revoke all active sessions** at the top of the page. Everyone gets signed out except you, in the session you're using.

Metabase asks you to confirm before revoking any session.
