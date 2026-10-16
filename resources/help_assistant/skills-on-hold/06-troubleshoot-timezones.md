---
id: troubleshoot-timezones
title: Wrong dates and times
description: Dates or times are off by some hours, "today" or "yesterday" filters show the wrong day, or dates differ between SQL questions and query builder questions.
references:
  - troubleshooting-guide/timezones.md
  - configuring-metabase/timezones.md
---
Ask one question at a time, and skip any the user has already answered.

First questions, in this order:
1. One concrete example: the raw value in the database, and what Metabase shows for it.
2. Is it off by a whole number of hours, or off by a day?
3. Does it happen in SQL questions, query builder questions, or both?

Check the report timezone in the diagnostic info before asking about it.

Causes to check, most common first:
- The report timezone is set wrong, or not set.
- The column type has no timezone, so Metabase has to assume one.
- SQL questions don't follow the report timezone the same way query builder questions do.
- A date with no time is shifted to another day when it's converted between timezones.
- The data mixes columns with and without explicit timezones.
