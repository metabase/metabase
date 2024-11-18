---
title: Embedded analytics SDK - CLI quickstart
---

# Embedded analytics SDK - CLI quickstart

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

We built a single command to spin up a Metabase and help you get an embedded dashboard in your app. This setup with API keys won't work in production; it's only intended for you to quickly try out the SDK on your local machine. A production setup requires a Pro/Enterprise license, and SSO with JWT.

## Prerequisites

- Docker (should be up and running on your machine)
- [Node.js 18.x LTS](https://nodejs.org/en) or higher.
- License (Optional - only if you want to try out multi-tenancy).
- Database (you can connect to your app's database).

## The quickstart command

Change into your React application and run:

```sh
npx @metabase/embedding-sdk-react@latest start
```

The tool will walk you through the setup. There are a fair number of pieces to put together, so here's an overview of what the command does.

## Checks for prereqs

- Checks that you're installing the SDK in a React application.
- Looks for, or installs, the Embedded analytics SDK.
- Checks that Docker is running on your machine.
- Asks you if you have a database to connect to (use left and right arrow keys to select "no" or "yes"). The tool will use this database to generate an embedded dashboard. If you answer no, the script will use the Sample Database that ships with Metabase to create a dashboard.

## Sets up Metabase

- Asks you for an email address to create the first admin account in Metabase. Doesn't have to be a real email address (the tool doesn't set up a SMTP server); the email address is just required for login.
- Spins up a Metabase on Docker. This takes a bit. To see the Docker container's status, use the `docker ps` command. Or use the time to reflect on good choices you've made recently.
- Generates a new [API key](../../people-and-groups/api-keys.md).

## Connects Metabase to your database

- Prompts you to connect to a database. Pick your database's engine. You'll need the database's host, port, username, and password.
- Connects to the database, and prompts you to select tables from your database to embed. Pick 1-3 tables. If you want to see multi-tenancy in action, pick a table with user IDs in it. Metabase will X-ray these tables to create a dashboard to embed.

## (Optional) sets up permissions with multi-tenancy

If you have a Pro/EE license, the tool can set up permissions. To get a license, sign up for a [free trial of self-hosted Metabase Pro](https://www.metabase.com/pricing/).

If you opted to set up multi-tenancy and connected to your own database, the tool will ask you for the column you want to use to sandbox the table (e.g., a user ID column). Metabase will [sandbox data](../../permissions/data-sandboxes.md) based on the values in that column.

The tool will also set up a mock Express server with JWT. It'll ask you where it should save the server code (default: `./mock-server`). It'll install the server's dependencies with `npm install`.

You'll need to start the mock server in another terminal session. Change into the mock server's directory and run:

```sh
npm run start
```

## Generates React components that you'll import into your app

Generates example React components files. By default, it will save them in `./components/metabase` in your React app, though the tool will prompt you to save them to a different directory (e.g., `./src/components/metabase`).

## Add the Metabase/React components to your app

Once the mock server is running, go back to the tool's terminal session and press <Enter> to continue.

Prompts you to add the following `import` in your client app:

```sh
import { AnalyticsPage } from "../metabase/components";
```

Make sure the `from` path is valid (depending on your app, you may need to move the components to a new directory).

Then you'll need to add the `<AnalyticsPage />` component to a page in your app.

## Start your app and view the analytics page

Start your app, and view the page where you added the `<AnalyticsPage />` component, and you should see an embedded dashboard.

## Check out your Metabase

Your Metabase should be running at `http://localhost:3366`. You can find your login credentials at `METABASE_LOGIN.json`.

## Further reading

- [Quickstart with sample app and JWT](./quickstart.md)
