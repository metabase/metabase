---
id: troubleshoot-db-connection
title: Database connection failures
description: Metabase can't connect to a database, a connection that used to work stopped working, or questions fail with connection errors or "connections cannot be acquired".
references:
  - troubleshooting-guide/db-connection.md
  - troubleshooting-guide/timeout.md
  - databases/connecting.md
  - databases/ssl-certificates.md
  - databases/ssh-tunnel.md
  - cloud/ip-addresses-to-whitelist.md
---
Ask one question at a time, and skip any the user has already answered.

Check first, if you can check this instance:
- Check the databases (check_databases) for recent failures. If more than one database has failures, list them with their errors and ask which one they mean. No failures doesn't mean it's working: the check only knows about syncs that have already run.
- Search the logs at warning level and up for "connect", and for "Error processing query" if questions are failing. These lines don't name the database.
- When they're adding a new database with the SSL toggle off, Metabase may try with SSL first, so one Save can log two failures. The last one is the real error.
- If nothing turns up, ask them to try again in a new browser tab (click Save, or run a question on that database), keeping this chat open, and to tell you right after. Make that your only request in that reply; don't ask for the error message yet. Then check again. If you still can't see the error, carry on with the questions below.
- Use the error to sort it into one of the groups below. If it doesn't clearly fit one, quote it to the admin and carry on with the questions instead of guessing.

If you couldn't check, or the checks and a retry didn't find the error, and they haven't asked for the list, ask these in this order, skipping any a check already answered:
1. The exact error message, unless a check already found it. Don't ask anything else in the same message. The diagnostic info lists the database engines in use, so don't ask which engine it is.
2. Is this a new connection, or one that used to work? If it used to work, ask what changed on the database side, such as a rotated password, a firewall change, a moved host or a renewed certificate.
3. Is this Metabase Cloud or self-hosted? The network causes differ.

Sort the error into one of:
A. Can't reach the database server
B. Reached it, but the login was refused
C. SSL or certificate errors
D. Timeouts, or "connections cannot be acquired"

Causes to check, most common first:

A. Can't reach the server
- Wrong host or port.
- A firewall or allowlist blocks the Metabase server. On Metabase Cloud, the database has to allow Metabase Cloud's IP addresses.
- The database is only reachable on a private network, which needs an SSH tunnel.

B. Login refused
- The password was changed or rotated and not updated in Metabase.
- The database user doesn't have permission to connect to that database.

C. SSL or certificate
- The database requires SSL and it isn't turned on in Metabase, or the certificate changed or expired.

D. Timeouts
- The database is overloaded, or queries are too heavy for it. Use the timeout and connection error sections of the troubleshooting guide.

Trap: Metabase connects from the Metabase server, not from the user's computer. A connection that works from their laptop doesn't prove Metabase can reach the database.
