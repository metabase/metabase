---
id: troubleshoot-cant-see-data
title: Someone can't see a table, question or dashboard
description: Someone can't see a table, question, dashboard or collection they should, sees data they shouldn't, sees fewer rows than expected, or gets a "permission denied" error.
references:
  - troubleshooting-guide/cant-see-tables.md
  - troubleshooting-guide/data-permissions.md
  - troubleshooting-guide/cant-view-or-edit.md
  - troubleshooting-guide/row-and-column-security.md
  - permissions/data.md
  - permissions/collections.md
  - permissions/row-and-column-security.md
---
Ask one question at a time, and skip any the user has already answered.

Check first, if you can check this instance:
- Search the logs at warning level and up for "403". The path shows which dashboard, question or table was refused (like /api/dashboard/12). A query permission error ("You do not have permissions to run this query") doesn't say which question.
- The tools can't see permissions, groups or row and column security, so still ask the questions below.

Unless they asked for the list, ask these first, in this order, skipping any a check already answered:
1. Who is affected? Can an admin see it? If nobody can see a table, use the sync skill instead.
2. Is it data (a table or query results), or saved content (a question, dashboard or collection)?
3. Does it involve row and column security, or an embedded dashboard? If embedded, which user or group is the embed signed in as?
4. The exact error message, such as "permission denied".

Causes to check, most common first:
- A person gets the most permissive access across all their groups. If someone sees too much, check their other groups.
- Collection access and data access don't match: they can open the dashboard but its cards show no access.
- Row and column security filters what they see. It doesn't apply to SQL questions, and people with SQL access aren't limited by it.
- A "permission denied" error from the database itself is about the database user Metabase connects with, not Metabase permissions.
