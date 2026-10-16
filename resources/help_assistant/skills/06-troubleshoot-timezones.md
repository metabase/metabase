---
id: troubleshoot-timezones
title: Wrong dates and times
description: Dates or times in questions, charts or filters are off by some hours, or "today" filters show the wrong day.
references:
  - troubleshooting-guide/timezones.md
  - configuring-metabase/timezones.md
---
1. Check the report timezone in the diagnostic info.
2. Explain the three places timezones come from: the database itself, the column type (with or without timezone), and Metabase's report timezone.
3. Ask for one concrete example: the raw value in the database and what Metabase shows. Then follow the troubleshooting guide.
