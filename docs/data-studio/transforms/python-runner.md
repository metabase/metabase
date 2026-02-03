---
title: Python runner
summary: Configure self-hosted Python execution environment to run Python transforms in Metabase.
---

# Python runner

> Self-hosted Python transforms require self-hosted Pro or Enterprise plan with the Transforms add-on.

To run Python transforms from a self-hosted Metabase, you'll need to configure a separate self-hosted execution environment. If you're using Metabase Cloud, you only need to add the Transforms add-on.

## Prerequisites

- Docker installed and running
- **Metabase Pro or Enterprise license** (Python Runner requires a Pro/Enterprise plan)
- For production: an S3-compatible storage bucket (AWS S3, MinIO, etc.)

## Quickstart

The simplest way to try the Python Runner is using its built-in S3 server (not for production):

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
  --name python-runner metabase/python-runner:latest

docker run -d \
  --network metabase-network \
  -p 3000:3000 \
  -e MB_PYTHON_RUNNER_URL=http://python-runner:5000 \
  -e MB_PYTHON_RUNNER_API_TOKEN=your-secure-token-here \
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

These settings can also be configured in the Metabase UI at **Admin Settings** > **Settings** > **Python Runner** (`/admin/settings/python-runner`). Note that environment variables take precedence over UI settings.

| Variable                                  | Description                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `MB_PYTHON_RUNNER_URL`                    | URL where Metabase can reach the Python Runner (e.g., `http://python-runner:5000`) |
| `MB_PYTHON_RUNNER_API_TOKEN`              | Authentication token. Must match `AUTH_TOKEN` in the Python Runner.                |
| `MB_PYTHON_STORAGE_S_3_ENDPOINT`          | S3 endpoint URL.                                                                   |
| `MB_PYTHON_STORAGE_S_3_BUCKET`            | S3 bucket name for storing Python artifacts                                        |
| `MB_PYTHON_STORAGE_S_3_REGION`            | AWS region (e.g., `us-east-1`)                                                     |
| `MB_PYTHON_STORAGE_S_3_ACCESS_KEY`        | S3 access key                                                                      |
| `MB_PYTHON_STORAGE_S_3_SECRET_KEY`        | S3 secret key                                                                      |
| `MB_PYTHON_STORAGE_S_3_PATH_STYLE_ACCESS` | (Optional) Set to `true` for S3-compatible services like MinIO or LocalStack       |

---

# Using Docker Compose

Docker Compose simplifies managing multiple containers. Below are example configurations for different scenarios.

## Simple setup with LocalStack

For simple setup and local testing, you can use LocalStack to simulate S3:

```yml
name: metabase-python-runner
services:
  metabase:
    image: metabase/metabase-enterprise:latest
    ports:
      - "3000:3000"
    environment:
      - MB_PYTHON_RUNNER_URL=http://python-runner:5000
      - MB_PYTHON_RUNNER_API_TOKEN=your-secure-token-here
      - MB_PYTHON_STORAGE_S_3_ENDPOINT=http://localstack:4566
      - MB_PYTHON_STORAGE_S_3_BUCKET=metabase-python-runner
      - MB_PYTHON_STORAGE_S_3_REGION=us-east-1
      - MB_PYTHON_STORAGE_S_3_PATH_STYLE_ACCESS=true
      - MB_PYTHON_STORAGE_S_3_ACCESS_KEY=test
      - MB_PYTHON_STORAGE_S_3_SECRET_KEY=test
    depends_on:
      localstack-init:
        condition: service_completed_successfully
      python-runner:
        condition: service_started

  python-runner:
    image: metabase/python-runner:latest
    environment:
      - AUTH_TOKEN=your-secure-token-here

  localstack:
    image: localstack/localstack:latest
    environment:
      - SERVICES=s3
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4566/_localstack/health"]
      interval: 5s
      timeout: 5s
      retries: 10

  localstack-init:
    image: localstack/localstack:latest
    entrypoint:
      ["/bin/sh", "-c", "awslocal s3 mb s3://metabase-python-runner || true"]
    environment:
      - AWS_ENDPOINT_URL=http://localstack:4566
    depends_on:
      localstack:
        condition: service_healthy
```

Then run

```bash
docker compose up -d
```

## Production setup

For production, use an external S3-compatible storage service:

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
      - MB_PYTHON_STORAGE_S_3_ENDPOINT=${S3_ENDPOINT}
      - MB_PYTHON_STORAGE_S_3_BUCKET=${S3_BUCKET}
      - MB_PYTHON_STORAGE_S_3_REGION=${S3_REGION:-us-east-1}
      - MB_PYTHON_STORAGE_S_3_ACCESS_KEY=${S3_ACCESS_KEY}
      - MB_PYTHON_STORAGE_S_3_SECRET_KEY=${S3_SECRET_KEY}
    depends_on:
      python-runner:
        condition: service_started

  python-runner:
    image: metabase/python-runner:latest
    environment:
      - AUTH_TOKEN=${AUTH_TOKEN}
```

Create a `.env` file with your configuration:

```bash
AUTH_TOKEN=your-secure-token-here
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=metabase-python-runner
S3_REGION=us-east-1
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
```

Then run

```bash
docker compose up -d
```
