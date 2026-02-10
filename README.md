# Metabase

[Metabase](https://www.metabase.com) is the easy, open-source way for everyone in your company to ask questions and learn from data.

![Metabase Product Screenshot](https://www.metabase.com/images/metabase-product-screenshot-updated.png)

[![Latest Release](https://img.shields.io/github/release/metabase/metabase.svg?label=latest%20release)](https://github.com/metabase/metabase/releases)
[![codecov](https://codecov.io/gh/metabase/metabase/branch/master/graph/badge.svg)](https://codecov.io/gh/metabase/metabase)
![Docker Pulls](https://img.shields.io/docker/pulls/metabase/metabase)

## Get started

The easiest way to get started with Metabase is to sign up for a free trial of [Metabase Cloud](https://store.metabase.com/checkout). You get support, backups, upgrades, an SMTP server, SSL certificate, SoC2 Type 2 security auditing, and more (plus your money goes toward improving Metabase). Check out our quick overview of [cloud vs self-hosting](https://www.metabase.com/docs/latest/cloud/cloud-vs-self-hosting). If you need to, you can always switch to [self-hosting](https://www.metabase.com/docs/latest/installation-and-operation/installing-metabase) Metabase at any time (or vice versa).

## Key Features

- [Set up in five minutes](https://www.metabase.com/docs/latest/configuring-metabase/setting-up-metabase) (we're not kidding).
- Let anyone on your team [ask questions](https://www.metabase.com/docs/latest/questions/introduction) without knowing SQL.
- Use the [SQL editor](https://www.metabase.com/docs/latest/questions/native-editor/writing-sql) for more complex queries.
- Build handsome, interactive [dashboards](https://www.metabase.com/docs/latest/dashboards/introduction) with filters, auto-refresh, fullscreen, and custom click behavior.
- Create [models](https://www.metabase.com/learn/metabase-basics/getting-started/models) that clean up, annotate, and/or combine raw tables.
- Define canonical [segments and metrics](https://www.metabase.com/docs/latest/data-modeling/metrics) for your team to use.
- Send data to Slack or email on a schedule with [dashboard subscriptions](https://www.metabase.com/docs/latest/dashboards/subscriptions).
- Set up [alerts](https://www.metabase.com/docs/latest/questions/alerts) to have Metabase notify you when your data changes.
- [Embed charts and dashboards](https://www.metabase.com/docs/latest/embedding/introduction) in your app, or even [your entire Metabase](https://www.metabase.com/docs/latest/embedding/interactive-embedding).
- Build with the [Embedded Analytics SDK for React](https://www.metabase.com/docs/latest/embedding/sdk/introduction) to embed standalone components with custom styling that matches your app's design.

Take a [tour of Metabase](https://www.metabase.com/learn/metabase-basics/overview/tour-of-metabase).

## Supported databases

- [Officially supported databases](./docs/databases/connecting.md#connecting-to-supported-databases)
- [Community drivers](./docs/developers-guide/community-drivers.md)

## Installation

Metabase can be run just about anywhere. Check out our [Installation Guides](https://www.metabase.com/docs/latest/installation-and-operation/installing-metabase).

## Contributing

## Quick Setup: Dev environment

In order to spin up a development environment, you need to start the front end and the backend as follows:

### Frontend quick setup

The following command will install the JavaScript dependencies:

```bash
bun install
```

To build and run without watching changes:

```bash
bun run build
```

To build and run with hot-reload:

```bash
bun run build-hot
```

### Backend  quick setup

To run the backend, you'll need to build the drivers first, and then start the backend:

```bash
./bin/build-drivers.sh
clojure -M:run
```

For a more detailed setup of a dev environment for Metabase, check out our [Developers Guide](./docs/developers-guide/start.md).

## Internationalization

We want Metabase to be available in as many languages as possible. See which translations are available and help contribute to internationalization using our project over at [Crowdin](https://crowdin.com/project/metabase-i18n). You can also check out our [policies on translations](https://www.metabase.com/docs/latest/administration-guide/localization.html).

## Extending Metabase

Hit our Query API from JavaScript to integrate analytics. Metabase enables your application to:

- Build moderation interfaces.
- Export subsets of your users to third party marketing automation software.
- Provide a custom customer lookup application for the people in your company.

Check out our guide, [Working with the Metabase API](https://www.metabase.com/learn/metabase-basics/administration/administration-and-operation/metabase-api).

## Security Disclosure

See [SECURITY.md](./SECURITY.md) for details.

## License

This repository contains the source code for both the Open Source edition of Metabase, released under the AGPL, as well as the [commercial editions of Metabase](https://www.metabase.com/pricing/), which are released under the Metabase Commercial Software License.

See [LICENSE.txt](./LICENSE.txt) for details.

Unless otherwise noted, all files © 2025 Metabase, Inc.

## Community

- [Discourse](https://discourse.metabase.com/)
- [Twitter](https://x.com/metabase)
- [LinkedIn](https://www.linkedin.com/company/metabase/)
- [YouTube](https://www.youtube.com/@metabasedata)
- [Reddit](https://www.reddit.com/r/Metabase/)

## Metabase Experts

If you’d like more technical resources to set up your data stack with Metabase, connect with a [Metabase Expert](https://www.metabase.com/partners/?utm_source=readme&utm_medium=metabase-expetrs&utm_campaign=readme).
