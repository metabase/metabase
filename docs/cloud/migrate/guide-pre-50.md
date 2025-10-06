---
title: "Migrate to Metabase Cloud - Metabase 49 or lower"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
section: Migrate
---

# Migrate to Metabase Cloud - Metabase 49 or lower

> If you're running Metabase 50 or above, check out [this guide](./guide.md).

The migration from a self-hosted Metabase to Metabase Cloud will keep all of your questions, dashboards, people, settings---everything in your existing Metabase.

And don't stress. You won't lose any of your work, and if you get stuck, we're here to help.

## Prepare to migrate

### Understand the limitations

There are some [limitations](../limitations.md) to Metabase Cloud that may impact your migration.

### Confirm you have the right access

In order to migrate, you'll need shell access to your self-hosted Metabase environment, and your Metabase environment will need access to the Internet.

### Schedule some downtime

Be sure to let your users know that your Metabase instance will be unavailable for the duration of the migration (ideally during off-hours). The migration process usually takes less than 15 minutes.

### Shut down your self-hosted Metabase instance

All you need to do is stop the Metabase JAR process or Docker container to make sure your Metabase has shut down. The idea here is to prevent people from creating more questions or dashboards that could put your instance in an inconsistent state during the migration.

### Back up your application database

In the unlikely event that something goes wrong, you'll want a backup. See [Backing up Metabase Application Data](../../installation-and-operation/backing-up-metabase-application-data.md).

## Migrate your Metabase to Metabase Cloud

The process itself is largely automated, but it's unique to your instance. Let's walk through it.

### Create a Metabase Cloud instance

You'll need a Metabase Cloud instance to migrate _to_. If you haven't already, [sign up for a free 14-day trial on Metabase Cloud](https://store.metabase.com/checkout).

If you already have a Metabase Cloud instance, you can skip this step.

### Follow the migration instructions

Visit [your Metabase Store account](https://store.metabase.com/account) and click **Initiate Migration**.

You'll get a command to run that will download a script to manage your migration. There is one command for the Metabase JAR and a different one if you're running Metabase via Docker.

Before executing the migration script, you may need to set the environment variables to match the usual configuration of your application database:

- **Docker**: the environment variables will already be set.
- **JAR**: set the environment variables by running `MB_DB_CONNECTION_URI=xxxxx migration_script.sh` on the server where you're running the JAR.
- **Heroku**: please follow a [few extra steps to running the script](./heroku.md).

### Execute the script in your self-hosted environment

> Warning: if you created any questions or dashboards in your Metabase Cloud instance, they will be overwritten when you upload the application data from your existing, self-hosted Metabase instance.

The script will upload your application data to your new Metabase Cloud instance. If all goes well, the script will print `Done!`.

If anything goes sideways, follow any prompts the script outputs. If you're still stuck, [send us an email](https://www.metabase.com/help/) and we'll help you troubleshoot.

## After migrating to Metabase Cloud

After a successful upload, some finishing touches and a restart is done automatically in a couple of minutes, and then you can log into your shiny new Metabase Cloud instance. You should see all of your questions and dashboards just as you did in your self-hosted instance.

- **If you're using Google Sign-in**, you'll need to go to [Google Developers Console](https://console.developers.google.com/) and add your new Metabase Cloud URL to the Authorized JavaScript Origins of the Google Auth Client ID.
- **For Pro and Enterprise customers using SAML SSO**, you'll need to update your settings with your identity provider to change the Redirect URL and the Base URL to your new Metabase Cloud URL, otherwise your identity provider will still redirect people to your old (and shut down) Metabase instance. See [Authenticating with SAML](../../people-and-groups/authenticating-with-saml.md).

## Tell your team about the new Metabase address

Once you've confirmed everything is working, go ahead and tell everyone the new Metabase Cloud URL address they should use to log into Metabase. People should be able to log in as usual and pick up right where they left off.

If you're embedding Metabase in an application, be sure to update your code to reflect your new URL.

## Put your old Metabase out to pasture

Though you should have already shut down your old Metabase instance, if you were self-hosting via a third-party, be sure to clean up and cancel any services to avoid any unnecessary charges (like storage for old backups, for example).

## And that's it!

We'll take care of your Metabase and keep it up to date from here on out. Welcome to Metabase Cloud!

## Need help?

If you have any questions, just [send us an email](https://www.metabase.com/help/).
