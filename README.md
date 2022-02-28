# Metabase

[Metabase](https://www.metabase.com/) is the easy, open-source way for everyone in your company to ask questions and learn from data.

![Metabase Product Screenshot](docs/metabase-product-screenshot.png)

[![Latest Release](https://img.shields.io/github/release/metabase/metabase.svg?label=latest%20release)](https://github.com/metabase/metabase/releases)
[![Circle CI](https://circleci.com/gh/metabase/metabase.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase)
[![codecov](https://codecov.io/gh/metabase/metabase/branch/master/graph/badge.svg)](https://codecov.io/gh/metabase/metabase)

## Features

- [Set up in five minutes](https://metabase.com/docs/latest/setting-up-metabase.html) (we're not kidding).
- Let anyone on your team [ask questions](https://metabase.com/docs/latest/users-guide/04-asking-questions.html) without knowing SQL.
- [SQL editor](https://www.metabase.com/docs/latest/users-guide/writing-sql.html) for analysts and data pros.
- Handsome, interactive [dashboards](https://metabase.com/docs/latest/users-guide/06-sharing-answers.html) with filters, auto-refresh, fullscreen, and custom click behavior.
- Create [models](https://www.metabase.com/learn/getting-started/models) that clean up and/or combine raw tables.
- Create canonical [segments and metrics](https://metabase.com/docs/latest/administration-guide/07-segments-and-metrics.html) for your team to use.
- Send data to Slack or email on a schedule with [dashboard subscriptions](https://www.metabase.com/docs/latest/users-guide/dashboard-subscriptions.html).
- View data in Slack anytime with [MetaBot](https://metabase.com/docs/latest/users-guide/11-metabot.html).
- [Humanize data](https://metabase.com/docs/latest/administration-guide/03-metadata-editing.html) for your team by renaming, annotating and hiding fields.
- See changes in your data with [alerts](https://www.metabase.com/docs/latest/users-guide/15-alerts.html).
- [Embed charts and dashboards](https://www.metabase.com/docs/latest/administration-guide/13-embedding.html) in your app, or even [your entire Metabase](https://www.metabase.com/docs/latest/enterprise-guide/full-app-embedding.html).

Learn more at [metabase.com](https://metabase.com/) and take a [tour of Metabase](https://www.metabase.com/learn/getting-started/tour-of-metabase).

## Supported databases

- [Officially supported databases](https://www.metabase.com/docs/latest/administration-guide/01-managing-databases.html#officially-supported-databases).
- [Community-supported drivers](https://www.metabase.com/docs/latest/developers-guide-drivers.html#how-to-use-a-community-built-driver).

## Installation

Metabase can be run just about anywhere. Check out our [Installation Guides](https://www.metabase.com/docs/latest/operations-guide/installing-metabase.html).

## Contributing

To get started with a development installation of the Metabase, check out our [Developers Guide](https://www.metabase.com/docs/latest/developers-guide/start).

## Internationalization

We want Metabase to be available in as many languages as possible. See which translations are available and help contribute to internationalization using our project over at [POEditor](https://poeditor.com/join/project/ynjQmwSsGh). You can also check out our [policies on translations](https://www.metabase.com/docs/latest/faq/general/what-languages-can-be-used-with-metabase.html).

# Extending Metabase

Metabase also allows you to hit our Query API directly from Javascript to integrate the simple analytics we provide with your own application or third party services to do things like:

- Build moderation interfaces.
- Export subsets of your users to third party marketing automation software.
- Provide a specialized customer lookup application for the people in your company.

## Security Disclosure

See [SECURITY.md](./SECURITY.md) for details.

## License

This repository contains the source code for both the Open Source edition of Metabase, released under the AGPL, as well as the [commercial editions of Metabase](https://www.metabase.com/pricing/), which are released under the Metabase Commercial Software License. 

See [LICENSE.txt](./LICENSE.txt) for details.

Unless otherwise noted, all files © 2022 Metabase, Inc.
