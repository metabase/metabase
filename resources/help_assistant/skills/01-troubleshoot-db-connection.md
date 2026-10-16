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

First questions, in this order:
1. The exact error message, and which database it is. The diagnostic info lists the database engines in use.
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
