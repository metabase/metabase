---
title: Troubleshooting error messages
---

# Troubleshooting error messages

An error message can help you find the right troubleshooting guide. The exact wording depends on your database and Metabase version, so try to look for the closest match.

## SQL editor

See if your error details contain any of:

- [Table or column "not found" or "not recognized"](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-syntax#column-or-table-name-is-not-found-or-not-recognized).
- [Function does not exist](https://www.metabase.com/learn/grow-your-data-skills/learn-sql/debugging-sql/sql-syntax#sql-function-does-not-exist).
- [Permission denied](./data-permissions.md#getting-a-permission-denied-error-message).

For example, this SQL error tells you that the function `DATEFROMPARTS` does not work on a BigQuery database:

![Sample SQL error message](./images/sample-error-sql.png)

## Questions and dashboards

- [Your question took too long](./timeout.md).
- [Still waiting...](./my-dashboard-is-slow.md).

## Are you still stuck?

If you can't find your error on this page:

- Search or ask the [Metabase community](https://discourse.metabase.com/).
- Search for [known bugs or limitations](./known-issues.md).
