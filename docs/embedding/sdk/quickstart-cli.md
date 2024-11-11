---
title: Embedded analytics SDK - CLI quickstart
---

# Embedded analytics SDK - CLI quickstart

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

We built a single command to spin up a Metabase and help you get an embedded dashboard in your app. This setup won't work in production; it's only intended for you to quickly try out the SDK on your local machine.

## Prerequisites

- Docker
- [Node.js 18.x LTS](https://nodejs.org/en) or higher.
- License (Optional - only if you want to try out multi-tenancy).
- Database (you can connect to your app's database).

## The quickstart command

Change into your React application and run:

```sh
npx @metabase/embedding-sdk-react@latest start
```

## Script overview

The script will walk you through the setup. There are a fair number of pieces to put together, so here's an overview of what the command does.

1. Checks that you're installing the SDK in a React application.
2. Looks for, or installs, the Embedded analytics SDK.
3. Spins up a Metabase on Docker. This takes a bit. To see the Docker container's status, use the `docker ps` command. Or use the time to reflect on good choices you've made recently.
4. Asks you for an email address to create the first admin account in Metabase.
5. Generates a new API Key. The script will build a mock Express server that will use this key to authenticate its requests to your Metabase.
6. Prompts you to connect to a database. Pick your database's engine. You'll need the database's host, port, username, and password (if Postgres, you can also use an auth provider).
7. Connects to the database, and prompts you to select tables from your database to embed. Pick 1-3 tables. If you want to see multi-tenancy in action, pick a table with user IDs in it. Metabase will X-ray these tables to create a dashboard to embed.
8. (Optional): If you have a Pro/EE license, the script can set up permissions. To get a license, sign up for a [free trial of self-hosted Metabase Pro](https://www.metabase.com/pricing/).
9. (Optional): If you set up multi-tenancy, the script asks you for the column used to sandbox the table (e.g., a user ID column). Metabase will sandbox data based on the values in that column.
10. Generates example React components files in "./components/metabase" in your React app (you may need to move these into your `src` directory).
11. Asks you where it (the script) should save the mock Express server (default: `./mock-server`). It'll install the mock server's dependencies with `npm install`.
12. Prompts you to start the mock server in another terminal session. Change into the mock server's directory and run:
    ```sh
    npm run start
    ```
    Once the mock server is running, go back to the script's terminal session and press <Enter> to continue.
13. Prompts you to add the following `import` in your client app:
    ```sh
    import { AnalyticsPage } from "././components/metabase";
    ```
    Make sure the `from` path is valid (depending on your app, you may need to move the components to a new directory).
14. Prompts you to add the `<AnalyticsPage />` component to your page.
15. Start your app, and view the page where you added the `<AnalyticsPage />` component, and you should see an embedded dashboard.

Your Metabase should be running at `http://localhost:3366`. You can find your login credentials at `METABASE_LOGIN.json`.

## Further reading

- [Quickstart with sample app and JWT](./quickstart.md)
