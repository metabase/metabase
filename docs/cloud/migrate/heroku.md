---
title: "Migrating from Heroku to Metabase Cloud"
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
redirect_from:
  - /cloud/docs/migrate/heroku
---

# Migrating from Heroku to Metabase Cloud

There are some additional steps you'll need to take to migrate from Heroku to Metabase Cloud. Let's walk through it.

## Follow the migration guide to get the migration script

You should follow along with the [migration guide](./guide.md). Once you download the migration script you'll need to get shell access to your Heroku server to execute the migration script.

## Install Heroku CLI for your OS

To get shell access, follow the instructions for your operating system to [install the Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli#download-and-install).

### Get shell access to your Heroku server

In order to get access to the server running Metabase on Heroku, you'll need to use [Heroku Exec (SSH tunneling)](https://devcenter.heroku.com/articles/exec).

With the Heroku CLI installed, run:

```bash
heroku ps:exec --app your-metabase-app-name-in-heroku
```

Replacing your-metabase-app-name-in-heroku with your app name.

You may be prompted to log in to Heroku through your browser. Once logged in, you may get a prompt saying that running this command for the first time requires a dyno restart: hit `y` to continue. The dyno restart will take a bit, but once it restarts, you'll get a shell prompt for the server running your Metabase in Heroku.

### Set your MB_DB_CONNECTION_URI

Before running the migration script, you'll need to set the `MB_DB_CONNECTION_URI`.

To get the Config Vars, log in to Heroku and go to the **Settings** tab for your Metabase app. In the **Config vars** section, you'll see your `DATABASE_URL`. Copy the corresponding connection URL string, which you'll use to set your `MB_DB_CONNECTION_URI`. Setting this environment variable will let your new Metabase Cloud instance access data in your existing application database.

In the shell logged into your Heroku server, run:

```bash
export MB_DB_CONNECTION_URI=YOUR_DATABASE_URL_GOES_HERE
```

### Run the migration script in your heroku

In the same shell session, run your [migration script](./guide.md).

```bash
curl -s long-metabase-migration-script-url | bash
```

That should be all there is to it. See the [migration guide](./guide.md) for details.
