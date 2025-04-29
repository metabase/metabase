---
title: Danger zone
description: The Danger Zone section of database connections is where you can discard field values or remove database connections and all of their related content.
---

# Danger Zone

The Danger zone section of the database connection is the destructive section. Here you can discard field values for that database, or remove the database entirely.

But since of course you're making [backups of your Metabase application database](../installation-and-operation/backing-up-metabase-application-data.md), it's not _that_ destructive. But these changes are permanent in Metabase. The only way to get your stuff back is if you restore your Metabase application database from a backup. If you're on [Metabase Cloud](https://www.metabase.com/cloud/), backups are handled for you.

To access the Danger Zone section for a database connection:

1. Click on the **gear** icon in the top right of Metabase.
2. Go to **Admin settings** > **Databases**.
3. Find the database you want to modify and click on it.
4. Scroll down to the bottom of the database's settings page to find the "Danger Zone" section.

## Discard saved field values

This option allows you to clear all saved field values that were collected during [syncs and fingerprinting](./sync-scan.md). This will remove the cached information about your database's fields, but won't affect your actual database data or connection settings.

## Remove this database

> If you’re trying to migrate from a development DB to a production one, you don’t need to do this. You can just
> edit your connection details.

This will delete the database _connection_ (not your database and its data). But deleting the connection will also delete all of the questions, models, metrics, segments. You'll have to check a bunch of boxes to even do this to make you know what you're doing.

This action is irreversible in Metabase. If you accidentally delete a database connection, the only way to get your stuff back is to restore your Metabase from the last [backup of your application database](../installation-and-operation/backing-up-metabase-application-data.md).
