---
title: Python runner
summary: Configure self-hosted Python execution environment to run Python transforms in Metabase.
---

# Python runner

> Self-hosted Python transforms require self-hosted Pro or Enterprise plan with the [Advanced transforms add-on](addons.md).

To run Python transforms from a self-hosted Metabase, you'll need to configure a separate self-hosted execution environment. If you're using Metabase Cloud, you'll need to buy the Transforms add-on.

## Prerequisites

- Docker installed and running, or an infrastructure that can run containers.
- **Self-hosted Metabase Pro or Enterprise license** (Python Runner requires a Pro/Enterprise plan).
- For production: an S3-compatible storage bucket (AWS S3, MinIO, etc.).

## Quickstart

The simplest way to try the Python Runner is to use the built-in S3 server (not for production):

```bash
# Create a Docker network for the containers to communicate
docker network create metabase-network

# Start the Python Runner with internal S3
docker run -d \
  --network metabase-network \
  -e AUTH_TOKEN=your-secure-token-here \
  -e ENABLE_INTERNAL_S3=true \
  --name python-runner metabase/python-runner:latest

# Start Metabase Enterprise
docker run -d \
  --network metabase-network \
  -p 3000:3000 \
  -e MB_PYTHON_RUNNER_URL=http://python-runner:5000 \
  -e MB_PYTHON_RUNNER_API_TOKEN=your-secure-token-here \
  -e MB_PYTHON_STORAGE_S_3_ENDPOINT=http://python-runner:4566 \
  -e MB_PYTHON_STORAGE_S_3_BUCKET=metabase-python-runner \
  -e MB_PYTHON_STORAGE_S_3_REGION=us-east-1 \
  -e MB_PYTHON_STORAGE_S_3_PATH_STYLE_ACCESS=true \
  -e MB_PYTHON_STORAGE_S_3_ACCESS_KEY=test \
  -e MB_PYTHON_STORAGE_S_3_SECRET_KEY=test \
  --name metabase metabase/metabase-enterprise:latest
```

## Production setup

For production, use an external S3-compatible storage service:

### Step 1: Generate a secure authentication token

```bash
openssl rand -hex 32
```

Save this token securely - you'll need it for both containers.

### Step 2: Set up S3 storage

Create a bucket in your S3-compatible storage service (AWS S3, MinIO, etc.) and note your access credentials.

### Step 3: Start the containers

```bash
docker network create metabase-network

docker run -d \
  --network metabase-network \
  -e AUTH_TOKEN=your-secure-token-here \
  --name python-runner --hostname python-runner metabase/python-runner:latest

docker run -d \
  --network metabase-network \
  -p 3000:3000 \
  -e MB_PYTHON_RUNNER_URL=http://python-runner:5000 \
  -e MB_PYTHON_RUNNER_API_TOKEN=<your-secure-token-here> \
  -e MB_PYTHON_STORAGE_S_3_ENDPOINT=https://s3.amazonaws.com \
  -e MB_PYTHON_STORAGE_S_3_BUCKET=your-bucket-name \
  -e MB_PYTHON_STORAGE_S_3_REGION=us-east-1 \
  -e MB_PYTHON_STORAGE_S_3_ACCESS_KEY=your-access-key \
  -e MB_PYTHON_STORAGE_S_3_SECRET_KEY=your-secret-key \
  --name metabase metabase/metabase-enterprise:latest
```

## Configuration reference

### Python Runner environment variables

| Variable             | Description                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `AUTH_TOKEN`         | Authentication token for API requests. Must match `MB_PYTHON_RUNNER_API_TOKEN` in Metabase. |
| `ENABLE_INTERNAL_S3` | Set to `true` to enable built-in S3 server on port 4566. Not for production.                |

### Metabase environment variables

These settings can also be configured in the Metabase UI at **Admin** > **Settings** > **Python Runner**. Note that environment variables take precedence over UI settings.

| Variable                                   | Description                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `MB_PYTHON_RUNNER_URL`                     | URL where Metabase can reach the Python Runner (e.g., `http://python-runner:5000`) |
| `MB_PYTHON_RUNNER_API_TOKEN`               | Authentication token. Must match `AUTH_TOKEN` in the Python Runner.                |
| `MB_PYTHON_STORAGE_S_3_ENDPOINT`           | S3 endpoint URL.                                                                   |
| `MB_PYTHON_STORAGE_S_3_CONTAINER_ENDPOINT` | S3 endpoint seen from the runner container, if different from the main endpoint.   |
| `MB_PYTHON_STORAGE_S_3_BUCKET`             | S3 bucket name for storing Python artifacts                                        |
| `MB_PYTHON_STORAGE_S_3_REGION`             | AWS region (e.g., `us-east-1`)                                                     |
| `MB_PYTHON_STORAGE_S_3_ACCESS_KEY`         | S3 access key                                                                      |
| `MB_PYTHON_STORAGE_S_3_SECRET_KEY`         | S3 secret key                                                                      |
| `MB_PYTHON_STORAGE_S_3_PATH_STYLE_ACCESS`  | (Optional) Set to `true` for S3-compatible services like MinIO or LocalStack       |

`MB_PYTHON_STORAGE_S_3_CONTAINER_ENDPOINT` is the host Metabase signs into the presigned URLs the runner uploads to and downloads from. Set it when the runner resolves storage by a different hostname than Metabase does.

## Using Docker Compose

Below are example configurations for different scenarios.

### Self-hosted storage with MinIO

[MinIO](https://min.io/) is an S3-compatible server you can run yourself, which makes it a common pick for self-hosted Metabase. This Compose file runs Metabase, the Python runner, MinIO, and a short-lived container that creates the bucket Metabase will use — neither MinIO nor Metabase creates that bucket for you.

```yml
name: metabase-python-runner
services:
  metabase:
    image: metabase/metabase-enterprise:latest
    ports:
      - "3000:3000"
    environment:
      - MB_PYTHON_RUNNER_URL=http://python-runner:5000
      - MB_PYTHON_RUNNER_API_TOKEN=${AUTH_TOKEN}
      - MB_PYTHON_STORAGE_S_3_ENDPOINT=http://minio:9000
      - MB_PYTHON_STORAGE_S_3_CONTAINER_ENDPOINT=http://minio:9000
      - MB_PYTHON_STORAGE_S_3_BUCKET=metabase-python-runner
      - MB_PYTHON_STORAGE_S_3_REGION=us-east-1
      - MB_PYTHON_STORAGE_S_3_PATH_STYLE_ACCESS=true
      - MB_PYTHON_STORAGE_S_3_ACCESS_KEY=${MINIO_ROOT_USER}
      - MB_PYTHON_STORAGE_S_3_SECRET_KEY=${MINIO_ROOT_PASSWORD}
    depends_on:
      minio-init:
        condition: service_completed_successfully
      python-runner:
        condition: service_started

  python-runner:
    image: metabase/python-runner:latest
    environment:
      - AUTH_TOKEN=${AUTH_TOKEN}

  minio:
    image: quay.io/minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_ROOT_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
    volumes:
      - minio-data:/data

  minio-init:
    image: quay.io/minio/mc:latest
    depends_on:
      minio:
        condition: service_started
    entrypoint:
      - /bin/sh
      - -c
      - |
        until mc alias set local http://minio:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do
          echo "waiting for minio..."; sleep 2;
        done
        mc mb --ignore-existing local/metabase-python-runner

volumes:
  minio-data: {}
```

Both S3 endpoint variables point at `http://minio:9000` because Metabase and the runner share the Compose network and reach MinIO by the same hostname. `MB_PYTHON_STORAGE_S_3_CONTAINER_ENDPOINT` sets the host Metabase signs into the presigned URLs the runner uploads to and downloads from — if your runner resolves storage by a different hostname than Metabase does, set this to the runner's view of it.

Create a `.env` file:

```bash
AUTH_TOKEN=your-secure-token-here
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
```

Then bring everything up and try a transform:

1. Put a strong shared secret in `AUTH_TOKEN` (the runner and Metabase have to agree on it):

   ```bash
   openssl rand -hex 32
   ```

2. Start the stack:

   ```bash
   docker compose up -d
   ```

3. You'll need a Pro or Enterprise license with the [Advanced transforms add-on](addons.md). In Metabase, [enable transforms](transforms-overview.md#enable-transforms), then [create a Python transform](python-transforms.md#create-a-python-transform) and click **Run**.

4. Open **Data Studio > Jobs > Runs** and find your run. If it failed, the run's logs will usually tell you whether Metabase couldn't reach the runner, or the runner couldn't reach MinIO.