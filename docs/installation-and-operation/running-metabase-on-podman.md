---
title: Running Metabase on Podman
redirect_from:
  - /docs/latest/operations-guide/running-metabase-on-podman
---

# Running Metabase on Podman

Our official Metabase Docker image is compatible on any system that is running [Podman](https://podman.io).

## Open Source quick start

Assuming you have [Podman](https://podman.io) installed and running, get the latest container image:

```
podman pull docker.io/metabase/metabase:latest
```

Then start the Metabase container:

```
podman run -d -p 3000:3000 --name=metabase docker.io/metabase/metabase:latest
```

This will launch an Metabase server on port 3000 by default.

Optional: to view the logs as your Open Source Metabase initializes, run:

```
podman logs -f metabase
```

Once startup completes, you can access your Open Source Metabase at `http://localhost:3000`.

To run your Open Source Metabase on a different port, say port 12345:

```
podman run -d -p 12345:3000 --name=metabase docker.io/metabase/metabase:latest
```

## Pro or Enterprise quick start

Use this quick start if you have a [license token](../paid-features/activating-the-enterprise-edition.md) for a [paid version](https://www.metabase.com/pricing) of Metabase, and you want to run Metabase locally.

Assuming you have [Podman](https://podman.io) installed and running, get the latest container image:

```
podman pull docker.io/metabase/metabase-enterprise:latest
```

Then start the Metabase container:

```
podman run -d -p 3000:3000 --name=metabase docker.io/metabase/metabase-enterprise:latest
```

This will launch a Metabase server on port 3000 by default.

Optional: to view the logs as Metabase initializes, run:

```
podman logs -f metabase
```

Once startup completes, you can access your Pro or Enterprise Metabase at `http://localhost:3000`.

To run your Pro or Enterprise Metabase on a different port, say port 12345:

```
podman run -d -p 12345:3000 --name=metabase docker.io/metabase/metabase-enterprise:latest
```
