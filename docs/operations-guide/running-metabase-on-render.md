# Running Metabase on Render

You can install Metabase on [Render](https://render.com) in under 5 minutes. It uses the official Docker image and is backed by Render's [fully-managed PostgreSQL](https://render.com/docs/databases).

Metabase on Render also includes a host of useful features:
* Free and automatic SSL certificate issuance and renewal.
* Instant setup for custom domains so you can run Metabase on `metabase.yourcompany.com`.
* Automatic backups of the application database.
* Built-in HTTP → HTTPS redirects.
* Horizontal and vertical scaling with automatic failovers.
* Full support for environment variables.
* Consolidated logging in your Render dashboard.
* Quick and easy upgrades to new Metabase versions.


### Launching Metabase

Before doing anything, make sure you have a Render account or [sign up](https://dashboard.render.com/register).

1. [Create a new PostgreSQL database](https://dashboard.render.com/new/database) on Render and copy the **internal database URL** to use below.

2. Fork [render-examples/metabase](https://github.com/render-examples/metabase) on GitHub.

3. Create a new **Web Service** on Render, and give Render's GitHub app permission to access your new repo.

4. Select `Docker` for the environment, and add the following environment variable under the *Advanced* section:

   | Key             | Value           |
   | --------------- | --------------- |
   | `MB_DB_CONNECTION_URI`  | The **internal connection string** for the database you created above. |

   You can optionally encrypt your Metabase database connection details by adding the `MB_ENCRYPTION_SECRET_KEY` environment variable as described in the [Metabase operations guide](https://metabase.com/docs/latest/operations-guide/start.html#encrypting-your-database-connection-details-at-rest).

   You can also specify a health check path: `/api/health`. If you do, Render will constantly monitor your Metabase instance and automatically restart it if the health check fails.

That's all you need to do! Metabase will be live on your Render URL as soon as the Docker build is complete.

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).

# Upgrading Metabase
When you first install Metabase, Render will use the latest stable version in the Dockerfile:

```dockerfile
FROM metabase/metabase:latest
```

To upgrade, simply trigger a manual deploy for Metabase in your Render dashboard.

You can also use a specific version of Metabase in your Dockerfile:

```dockerfile
FROM metabase/metabase:v0.32.8
```

Commit and push your changes and Render will automatically upgrade and deploy your Metabase instance.

You can email support@render.com for questions and support.
