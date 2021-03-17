# Running Metabase on Qovery

[Qovery](https://qovery.com) is a fully-managed cloud platform that runs on your AWS account where you can host static sites, backend APIs, databases, cron jobs, and all your other apps in one place.

Static sites are **completely free** on Qovery and include the following features:

- Continuous, automatic builds & deploys from GitHub, Bitbucket, and GitLab.
- Automatic SSL certificates through [Let's Encrypt](https://letsencrypt.org).
- Free managed PostgreSQL instance.
- Free SSD storage.
- Unlimited collaborators.
- Unlimited [custom domains](https://docs.qovery.com/guides/getting-started/setting-custom-domain/).

## Prerequisites

This guide assumes you already have a Airbyte project to deploy. If you need a project, use the [Quick Start](/docs/getting-started.md) to get started.

## Setup

### 1. Create a Qovery Account

Visit [the Qovery dashboard](https://console.qovery.com) to create an account if you don't already have one.

### 2. Create a project

* Click on the "Create a project" button and give a name to your project. Eg. `Metabase`
* Click on "Next".

### 3. Deploy

* Click on "I want to use a template".
![metabase use a template](https://github.com/Qovery/public-resources/raw/master/deploy/metabase/use-template.png)

* Select "Metabase".
![metabase select a template](https://github.com/Qovery/public-resources/raw/master/deploy/metabase/use-template.png)

* Select your GitHub or GitLab repository where Qovery will save your configuration files (Qovery uses Git as the source of truth).
![metabase connect repo](https://github.com/Qovery/public-resources/raw/master/deploy/metabase/connect-repo.png)

* Click on "Deploy".
![metabase use a template](https://github.com/Qovery/public-resources/raw/master/deploy/metabase/deploy.png)
