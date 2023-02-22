---
title: How to run a development branch of Metabase using Docker
---

# How to run a development branch of Metabase using Docker

If you want to run a branch of Metabase that's currently in development, the easiest way to get started is to use a pre-built Docker image. You can also [compile Metabase yourself](build.md).

If you're looking to download and run the latest official open source version of Metabase, check the [operations guide](../installation-and-operation/installing-metabase.md). 

## Installing Docker

The only thing you’ll need to get started is Docker itself.

- [Install Docker Desktop](https://www.docker.com/products/docker-desktop)

OR

- If you like to install things via Homebrew:

```bash
brew install --cask docker
```
Once Docker is installed, you’re ready to go.

## Run a development branch to test or verify features

[See here](https://hub.docker.com/r/metabase/metabase-dev/tags) for a list of development branches that you can run via Docker.

1. Open your terminal app of choice.

2. Copy and paste this command, switching out `<branch-name>` for the name of the branch you’d like to test: 

```bash
docker run --platform linux/amd64 -d -p 3000:3000 --name metabase-dev metabase/metabase-dev:<branch-name>
```

3. In your browser, navigate to `http://localhost:3000`, where you should see Metabase. It may take a minute or two to start up depending on your computer.

**Note**: This will always start Metabase with a fresh database.

## Pull and run the latest changes

Run:

```
docker pull metabase/metabase-enterprise-head:latest
```

Then:

```
docker run --platform linux/amd64 -d -p 3000:3000 --name metabase metabase/metabase-enterprise-head:latest
```

The “latest” tag is not automatically upgraded on your local machine, so the above commands ensure that you’re pulling the latest changes.
