# Production Deployment

This deploy setup builds the custom Metabase image in GitHub Actions, pushes it to GitHub Container Registry, then updates a Docker Compose stack on the server.

## Server Prerequisites

- A Linux server with ports `80` and `443` open.
- DNS `A` record pointing your Metabase domain at the server.
- Docker Engine with the `docker compose` plugin installed.
- A deploy user that can run Docker commands.
- Directory `/opt/collegiate-metabase` owned by the deploy user.

Example server setup:

```bash
sudo mkdir -p /opt/collegiate-metabase
sudo chown "$USER:$USER" /opt/collegiate-metabase
```

## GitHub Secrets

Add these in GitHub: `Settings` -> `Secrets and variables` -> `Actions`.

```text
PRODUCTION_HOST
PRODUCTION_USER
PRODUCTION_SSH_KEY
PRODUCTION_SSH_PORT
PRODUCTION_DOMAIN
PRODUCTION_ACME_EMAIL

GHCR_USER
GHCR_TOKEN

MB_DB_HOST
MB_DB_PORT
MB_DB_DBNAME
MB_DB_USER
MB_DB_PASS
MB_ENCRYPTION_SECRET_KEY
```

`GHCR_TOKEN` should be a GitHub token with permission to read packages. `MB_ENCRYPTION_SECRET_KEY` must be generated once and kept stable for the life of the deployment.

Generate an encryption key locally:

```bash
openssl rand -base64 32
```

## Production Notes

- Do not use H2 for the Metabase application database in production.
- Keep StarRez API token, Blob SAS URL, and StarRez Postgres password in Metabase settings only after `MB_ENCRYPTION_SECRET_KEY` is configured, or set them as environment-backed Metabase settings.
- Use the least-privilege Azure Blob SAS permissions required by the integration.
- Use a separate Postgres database/user for the Metabase application database and the StarRez data database.
- Caddy terminates HTTPS automatically for `PRODUCTION_DOMAIN`.
