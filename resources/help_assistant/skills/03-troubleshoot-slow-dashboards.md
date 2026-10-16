---
id: troubleshoot-slow-dashboards
title: Slow dashboards and questions
description: Dashboards or questions take a long time to load or time out.
references:
  - troubleshooting-guide/my-dashboard-is-slow.md
  - troubleshooting-guide/db-performance.md
  - configuring-metabase/caching.md
---
1. Ask whether it's one dashboard or everything, and whether it's always slow or only at certain times.
2. One dashboard: point to the number of cards, filters without defaults, and heavy queries. Suggest caching and models.
3. Everything slow: suspect the data warehouse or the Metabase server's resources. Point to the database performance guide.
4. If the instance uses the H2 application database (check the diagnostic info), flag that H2 isn't meant for production use.
