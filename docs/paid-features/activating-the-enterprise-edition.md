---
title: Activating your Metabase commercial license
redirect_from:
  - /docs/latest/enterprise-guide/activating-the-enterprise-edition
---

# Activating your Metabase commercial license

The [paid Pro and Enterprise editions](https://www.metabase.com/pricing) of Metabase are distinct from the free [Open Source edition](../installation-and-operation/running-the-metabase-jar-file.md) and the [Starter version of Metabase Cloud](https://www.metabase.com/cloud/).

## If you're running on Metabase Cloud

If you've signed up for or upgraded to a Pro or Enterprise plan on Metabase Cloud, all of this will be taken care of for you.

## If you're self-hosting Metabase

To use your Pro/Enterprise features, you’ll need to do two things:

- Download Metabase Enterprise Edition
- Enter your license.

You can get a license by signing up for a free trial of the [Pro or Enterprise edition plans](https://www.metabase.com/pricing), both of which can be self-hosted or hosted on Metabase Cloud.

### Download the Enterprise edition

- [Enterprise Docker image](https://hub.docker.com/r/metabase/metabase-enterprise/) at `metabase/metabase-enterprise:latest`. (RECOMMENDED)
- [Enterprise JAR](https://downloads.metabase.com/enterprise/latest/metabase.jar).

You'll also need to set up a dedicated [application database](../installation-and-operation/configuring-application-database.md) to store your Metabase data.

### Enter your license

There are two ways to enter your license when self-hosting Metabase:

1. **When Metabase is running**: go to **Settings** > **Admin settings**, and click **License and Billing** in the lefthand sidebar. Paste in your license token under **License** and click **Activate**.

OR

2. **Before you start Metabase**: you can also set the license token with the [`MB_PREMIUM_EMBEDDING_TOKEN` environment variable](https://www.metabase.com/docs/latest/configuring-metabase/environment-variables#mb_premium_embedding_token). This environment variable must be set _before_ you start your Metabase.

## Upgrading from the open-source edition of Metabase

If you've been running the open-source edition of Metabase, you'll need to change to the Enterprise Edition (that goes for both the Pro and Enterprise plans).

Assuming you've been using a [production application database](../installation-and-operation/configuring-application-database.md), you can simply swap out the OSS Docker image or JAR for the Enterprise Edition.

- [Enterprise Docker image](https://hub.docker.com/r/metabase/metabase-enterprise/) at `metabase/metabase-enterprise:latest`.
- [Enterprise JAR](https://downloads.metabase.com/enterprise/latest/metabase.jar).

Upgrading to the Enterprise Edition will keep all of your questions, dashboards, people, settings---everything in your existing Metabase.

And don't stress. You won't lose any of your work, and if you get stuck, we're [here to help](https://www.metabase.com/help/premium).

## Validating your token

To validate your token and maintain access to Pro/Enterprise features, your Metabase needs to be able to access the Internet, specifically:

```
https://token-check.metabase.com/api/[token-id]/v2/status
```

(substituting `[token-id]` with your token ID).

If your Metabase can't validate the token, it'll disable the Pro/Enterprise features, but will continue to work normally as if you were running the Open Source edition.

If you can't expose your Metabase to the internet, talk to us about our [air-gapped Metabase](https://www.metabase.com/product/air-gapping).

## Routing outbound Metabase traffic through a proxy

In case you need to route outbound Metabase traffic through a proxy on your network, use the following command when starting Metabase:

```
java -Dhttps.proxyHost=[your proxy's hostname] -Dhttps.proxyPort=[your proxy's port] -jar enterprise_metabase.jar
```

Depending on your organization’s setup, you may need to take additional configuration steps. If the command above doesn't work for you, we recommend reaching out to your internal infrastructure or dev ops teams for assistance.

## IP addresses to whitelist

If you're hosting Metabase behind a firewall that blocks outgoing connections, you'll need to allow these IP addresses to ensure access to `token-check.metabase.com` to verify your license.

```
23.23.111.13
44.199.18.109
44.212.138.188
```
