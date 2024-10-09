---
title: Apache Pinot
redirect_from:
  - /docs/latest/administration-guide/databases/pinot
---

# Apache Pinot

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**.

Fill out the fields for that database, and click **Save changes** at the bottom.

## Settings

You can edit these settings at any time. Just remember to save your changes.

### Display name

The display name for the database in the Metabase interface.

### Controller Endpoint

Pinot controller endpoint. E.g., `http://localhost:9000`.

### Use an SSH tunnel

See our [guide to SSH tunneling](../ssh-tunnel.md).

### Authentication header

The username and password for the Pinot connection.

### Choose when Metabase syncs and scans

Turn this option **ON** to manage the queries that Metabase uses to stay up to date with your database. For more information, see [Syncing and scanning databases](../sync-scan.md).

#### Database syncing

If you've selected **Choose when syncs and scans happen** > **ON**, you'll be able to set:

- The frequency of the [sync](../sync-scan.md#how-database-syncs-work): hourly (default) or daily.
- The time to run the sync, in the timezone of the server where your Metabase app is running.

## Further reading

- [Managing databases](../../databases/connecting.md)
- [Metadata editing](../../data-modeling/metadata-editing.md)
- [Models](../../data-modeling/models.md)
- [Setting data access permissions](../../permissions/data.md)
