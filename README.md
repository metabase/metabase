# Metabase

[Metabase](https://www.metabase.com) is the easy, open-source way for everyone in your company to ask questions and learn from data.

![Metabase Product Screenshot](docs/images/metabase-product-screenshot.svg)

[![Latest Release](https://img.shields.io/github/release/metabase/metabase.svg?label=latest%20release)](https://github.com/metabase/metabase/releases)
[![codecov](https://codecov.io/gh/metabase/metabase/branch/master/graph/badge.svg)](https://codecov.io/gh/metabase/metabase)
![Docker Pulls](https://img.shields.io/docker/pulls/metabase/metabase)

## Features

- [Set up in five minutes](https://www.metabase.com/docs/latest/setting-up-metabase.html) (we're not kidding).
- Let anyone on your team [ask questions](https://www.metabase.com/docs/latest/users-guide/04-asking-questions.html) without knowing SQL.
- Use the [SQL editor](https://www.metabase.com/docs/latest/users-guide/writing-sql.html) for more complex queries.
- Build handsome, interactive [dashboards](https://www.metabase.com/docs/latest/users-guide/07-dashboards.html) with filters, auto-refresh, fullscreen, and custom click behavior.
- Create [models](https://www.metabase.com/learn/getting-started/models) that clean up, annotate, and/or combine raw tables.
- Define canonical [segments and metrics](https://www.metabase.com/docs/latest/administration-guide/07-segments-and-metrics.html) for your team to use.
- Send data to Slack or email on a schedule with [dashboard subscriptions](https://www.metabase.com/docs/latest/users-guide/dashboard-subscriptions).
- Set up [alerts](https://www.metabase.com/docs/latest/users-guide/15-alerts.html) to have Metabase notify you when your data changes.
- [Embed charts and dashboards](https://www.metabase.com/docs/latest/administration-guide/13-embedding.html) in your app, or even [your entire Metabase](https://www.metabase.com/docs/latest/enterprise-guide/full-app-embedding.html).

Take a [tour of Metabase](https://www.metabase.com/learn/getting-started/tour-of-metabase).

## Supported databases

- [Officially supported databases](./docs/databases/connecting.md#connecting-to-supported-databases)
- [Partner and Community drivers](./docs/developers-guide/partner-and-community-drivers.md)

## Installation

Metabase can be run just about anywhere. Check out our [Installation Guides](https://www.metabase.com/docs/latest/operations-guide/installing-metabase.html).

## Contributing

## Quick Setup: Dev environment

In order to spin up a development environment, you need to start the front end and the backend as follows:

### Frontend quick setup

The following command will install the Javascript dependencies:

```
$ yarn install
```

To build and run without watching changes:

```
$ yarn build
```

To build and run with hot-reload:

```
$ yarn build-hot 
```

### Backend  quick setup

In order to run the backend, you'll need to build the drivers first, and then start the backend:

```
$ ./bin/build-drivers.sh
$ clojure -M:run
```

For a more detailed setup of a dev environment for Metabase, check out our [Developers Guide](./docs/developers-guide/start.md).

## Internationalization

We want Metabase to be available in as many languages as possible. See which translations are available and help contribute to internationalization using our project over at [POEditor](https://poeditor.com/join/project/ynjQmwSsGh). You can also check out our [policies on translations](https://www.metabase.com/docs/latest/administration-guide/localization.html).

## Extending Metabase

Hit our Query API from Javascript to integrate analytics. Metabase enables your application to:

- Build moderation interfaces.
- Export subsets of your users to third party marketing automation software.
- Provide a custom customer lookup application for the people in your company.

Check out our guide, [Working with the Metabase API](https://www.metabase.com/learn/administration/metabase-api).

## Security Disclosure

See [SECURITY.md](./SECURITY.md) for details.

## License

This repository contains the source code for both the Open Source edition of Metabase, released under the AGPL, as well as the [commercial editions of Metabase](https://www.metabase.com/pricing), which are released under the Metabase Commercial Software License.

See [LICENSE.txt](./LICENSE.txt) for details.

Unless otherwise noted, all files © 2023 Metabase, Inc.

## [Metabase Experts](https://www.metabase.com/partners/)

If you’d like more technical resources to set up your data stack with Metabase, connect with a [Metabase Expert](https://www.metabase.com/partners/?utm_source=readme&utm_medium=metabase-expetrs&utm_campaign=readme).
