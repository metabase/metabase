---
id: troubleshoot-db-connection
title: Database connection failures
description: Metabase can't connect to a data warehouse, or a connection that used to work started failing.
references:
  - troubleshooting-guide/db-connection.md
  - troubleshooting-guide/timeout.md
  - databases/connecting.md
  - databases/ssl-certificates.md
  - databases/ssh-tunnel.md
---
1. Ask for the exact error message from the database's admin page or the server logs, and which database type it is (the diagnostic info lists the engines in use).
2. Sort the error into one of: can't reach the host (network, firewall, wrong host or port), reached it but login failed (credentials, user permissions), SSL/certificate problems, or timeouts.
3. Walk through checks for that category only, in order, using the troubleshooting guide.
4. Remind them that Metabase connects from the Metabase server, not from their laptop, so firewalls and allowlists must allow the server's address.
