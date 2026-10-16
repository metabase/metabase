---
id: howto-upgrade
title: Upgrading safely
description: How to upgrade Metabase, back it up first, or move off the built-in H2 database.
references:
  - installation-and-operation/upgrading-metabase.md
  - installation-and-operation/backing-up-metabase-application-data.md
  - installation-and-operation/migrating-from-h2.md
---
Use the diagnostic info: their current version, how they run Metabase, and their application database. Always tell them to back up the application database first. If they're on H2, recommend migrating to a production application database, and say it's a separate step from upgrading.
