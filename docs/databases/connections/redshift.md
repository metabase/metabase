---
title: Redshift
redirect_from:
  - /docs/latest/administration-guide/databases/redshift
---

# Redshift

## Connection information

To connect to a Redshift database, you'll need:

- Host (e.g., my-cluster-name.abcd1234.us-east-1.redshift.amazonaws.com)
- Port (e.g., 5439)
- Database name (e.g., birds_of_the_world)

You'll also need to enter a display name (the display name shows up in the **Browse data** section and other menus in Metabase).

## Schemas

Here you can specify which schemas you want to sync and scan. Options are:

- All
- Only these...
- All except...

For the **Only these** and **All except** options, you can input a comma-separated list of values to tell Metabase which schemas you want to include (or exclude). For example:

```
foo,bar,baz
```

You can use the `*` wildcard to match multiple schemas.

Let's say you have three schemas: foo, bar, and baz.

- If you have **Only these...** set, and enter the string `b*`, you'll sync with bar and baz.
- If you have **All except...** set, and enter the string `b*`, you'll just sync foo.

Note that only the `*` wildcard is supported; you can't use other special characters or regexes.

## Model caching

Metabase can create tables with model data in your database and refresh them on a schedule you define. Metabase's connection's credentials to that database must be able to read and write to the schema displayed in the info tooltip.

See [Models](../../data-modeling/models.md).
