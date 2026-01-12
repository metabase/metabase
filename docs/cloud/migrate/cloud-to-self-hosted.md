---
title: "Migrate from Metabase Cloud to a self-hosted Metabase"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
section: Migrate
---

# Migrate from Metabase Cloud to a self-hosted Metabase

> This guide outlines migrating _from_ Metabase Cloud to a self-hosted Metabase. If you want to migrate _to_ Metabase Cloud, check out [this guide](./guide.md) instead.

Migration from Metabase Cloud to self-hosted will keep all of your questions, dashboards, people, settings --- everything in your existing Metabase.

To migrate, you'll need to [contact our success team](https://www.metabase.com/help-premium) to get a snapshot of your Metabase's [application database](../../installation-and-operation/migrating-from-h2.md#metabases-application-database). This application database contains information about all the settings, questions, dashboards, models, users, etc from your Metabase Cloud instance. The application database is distinct from any of the databases you have connected to your Metabase. You'll need to host your own PostgreSQL database and import your data by restoring from this snapshot of your application database.

## Preparing to migrate from cloud to self-hosted

### Version of self-hosted Metabase should match Cloud version

The major version of your self-hosted Metabase should match the version of your Metabase Cloud instance. For example, if your Metabase Cloud instance is on version 52, then your self-hosted instance should be on version 52 as well.

You can find the version of your Metabase by clicking on the **Gear** icon in the top right of your Metabase and clicking on **About Metabase**. For Metabase Cloud, you can also see the version of your instance in the [Metabase Store](https://store.metabase.com).

### Use PostgreSQL for your application database

A self-hosted Metabase comes with a built-in H2 application database (H2 is a file-based database format). H2 database is appropriate for demos and trials, but you should **avoid using the built-in H2 application database for production setups!**

We recommend using PostgreSQL as your application database, but you can use MySQL or MariaDB as well. Before starting the migration from Metabase Cloud, [configure the application database](../../installation-and-operation/configuring-application-database.md) for your self-hosted instance.

For more on why you should use PostgreSQL as your application database, check out [How to run Metabase in production](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/metabase-in-production).

### If you're on a Pro plan, you'll need to switch to a self-hosted Pro plan

If you're migrating from a Metabase Cloud Pro plan to a self-hosted Pro plan, you'll need to cancel your Metabase Cloud Pro plan and start a new Pro self-hosted plan in [Metabase Store](https://store.metabase.com). The switch is necessary because:

- The terms and conditions differ between Cloud and self-hosted plans.
- You'll need a license token to activate your Pro features when self-hosting.

## How to migrate from Metabase Cloud to a self-hosted instance

1. **Request a snapshot of your application database** for your Metabase Cloud instance by [contacting our Success Engineering team](https://www.metabase.com/help-premium).

   Currently, you can't generate the snapshot yourself. A Metabase Success Engineer will generate a snapshot for you and email a link to download your snapshot from the Metabase Store.

2. **Download the snapshot from Metabase Store**. The email from Metabase Success Engineering will have a link to your download. You'll need to log in to the Metabase Store to access the download.

   The snapshot of your Metabase Cloud application database will be an H2 file database: a file with the extension `.mv.db`. (Metabase Cloud instances use PostgreSQL for application databases, but snapshots are saved in H2 format, so that you can restore to either PostgreSQL or MysQL application databases).

   Snapshots expire quickly, but don't sweat it; if your snapshot has expired, just request a new one.

3. **Import your application data into your self-hosted application database**. Follow the instructions to [migrate from H2 to a production application database](../../installation-and-operation/migrating-from-h2.md) using the `.mv.db` snapshot you downloaded.

   The migration will involve running a CLI command to load the data from the H2 snapshot you downloaded to your self-hosted application database.

   If you encounter any issues, check out the [troubleshooting guide](../../troubleshooting-guide/loading-from-h2.md) or [contact us](https://www.metabase.com/help-premium).

4. **Pro plans will need to input a license token to activate the paid features**. If you're migrating to a Pro self-hosted plan, [activate your Enterprise Edition token](../../installation-and-operation/activating-the-enterprise-edition.md).

   If you're on a Pro Cloud plan, you'll need to cancel that plan and start a new self-hosted Pro plan to get the token you'll need to activate your paid features . See [Preparing to migrate from cloud to self-hosted](#preparing-to-migrate-from-cloud-to-self-hosted).
