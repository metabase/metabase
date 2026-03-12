---
title: Modular embedding SDK - CLI quickstart
summary: Get started with the Modular embedding SDK using a single CLI command. Automatically set up Metabase with Docker, create dashboards, and generate React components.
---

# Modular embedding SDK - CLI quickstart

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embbedding=true %}

We built a single command to spin up a Metabase and help you get an embedded dashboard in your app. This setup with API keys won't work in production; it's only intended for you to quickly try out the SDK on your local machine. A production setup requires a Pro/Enterprise license, and SSO with JWT.

## Prerequisites

- Docker (should be up and running on your machine)
- [Node.js 20.x LTS](https://nodejs.org/en) or higher.
- License (Optional - only if you want to try out multi-tenancy).
- Database (you can connect to your app's database).

You don't need a running Metabase; the tool will set up a Metabase for you on Docker.

## The quickstart CLI command

Change into your React application and run:

```sh
npx @metabase/embedding-sdk-react@latest start
```

The CLI tool will walk you through the setup. There are a fair number of pieces to put together, so here's an overview of what the command does:

- [Prereq check](#prereq-check)
- [Database connection (optional)](#database-connection-optional)
- [Metabase setup](#metabase-setup)
- [Permissions setup with multi-tenancy (optional)](#permissions-setup-with-multi-tenancy-optional)
- [React components setup](#react-components-setup)
- [Behold: Metabase is embedded in your app](#behold-metabase-is-embedded-in-your-app)

## Prereq check

The tool will check for the following:

- You've run the command in the top-level directory of your React application.
- You've installed the SDK (if you haven't, the CLI will install the SDK for you and add it as a dependency in your `package.json`).
- You have Docker up and running on your machine.

## Database connection (optional)

The tool will ask if you have a database to connect to. Use the arrow keys to select Yes or No. The tool will use this database to generate an embedded dashboard.

If you answer no, the script will use the Sample Database that ships with Metabase to create a dashboard to embed.

If you select Yes, the tool will prompt you to connect to a database. Pick your database's engine. You'll need to provide database's host, port, username, and password. The tool will connect to the database, and prompt you to select tables from your database to embed. Pick 1-3 tables. If you want to see multi-tenancy in action, pick a table with user IDs in it. Metabase will X-ray these tables to create a dashboard to embed.

## Metabase setup

The tool will ask you for an email address to create the first admin account in Metabase. Doesn't have to be a real email address (the tool doesn't set up a SMTP server); the email address is just required for logging in to the Metabase that the tool will set up.

Next, the tool will spin up a Metabase on Docker. This takes a bit. To see the Docker container's status, use the `docker ps` command. Or use the time to reflect on good choices you've made recently.

Once Metabase is up and running, the tool will create an admin user with the email you provided, and generate an [API key](../../people-and-groups/api-keys.md) for that Metabase.

The tool will then prompt you to pick 1-3 tables to embed. You can press <space> to select, <a> to toggle all, <i> to invert selection, and <enter> to proceed.

## Permissions setup with multi-tenancy (optional)

If you have a Pro/EE license, the tool can set up permissions. To get a license, sign up for a [free trial of self-hosted Metabase Pro](https://www.metabase.com/pricing/).

If you opted to set up multi-tenancy and connected to your own database, the tool will ask you for the column you want to use to restrict the table (e.g., a user ID column). Metabase will [set row-level security](../../permissions/row-and-column-security.md) for that table based on the values in that column.

The tool will also set up a mock Express server to handle the JWTs. The tool will ask you where it should save the server code (default: `./mock-server`). It'll install the server's dependencies with `npm install`.

You'll need to start the mock server in another terminal session. Change into the mock server's directory and run:

```sh
npm run start
```

## React components setup

Next, the tool will generate example React components files. By default, the tool will save them in `./src/components/metabase` in your React app, though the tool will prompt you to save them to a different directory if you want (e.g., `./src/analytics`).
It generates a couple of demo components for you to try out theming and user switching:

- `AnalyticsDashboard` - a dashboard component that embeds a Metabase dashboard.
- `AnalyticsPage` - a page that embeds a dashboard with a wrapped provider. In a real application, you must add the `MetabaseProvider` separately to your app's root `App` component (or where you would've added your other providers).
- `ThemeSwitcher` - switch between light and dark themes.
- `UserSwitcher` - switch between fake users.
- `AnalyticsProvider` - a provider that adds the demo state for the example theme switcher and user switcher components.
- `EmbeddingProvider` - a provider that wraps the `MetabaseProvider` with demo themes and auth configuration.

You can delete these files once you've played around with the tool, and are ready to setup your own theming and user management.

## Add the Metabase/React components to your app

You'll need to add the Metabase/React components to your app. Add an import to your client app, like so:

```jsx
{% include_file "{{ dirname }}/snippets/quickstart-cli/example.tsx" snippet="imports" %}
```

Make sure the `from` path is valid (depending on your app, you may need to move the components to a new directory).

Then you'll need to add the `<AnalyticsPage />` component to a page in your app. Something like:

```jsx
{% include_file "{{ dirname }}/snippets/quickstart-cli/example.tsx" snippet="example" %}
```

## Behold: Metabase is embedded in your app

Start your app, and visit the page where you added the `<AnalyticsPage />` component. You should see an embedded dashboard.

You can also check out the Metabase the tool set up. The Metabase should be running at `http://localhost:3366`. You can find your login credentials at `METABASE_LOGIN.json`.

## Further reading

- [Quickstart with sample app and JWT](./quickstart.md)
