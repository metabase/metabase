---
title: Activating your Metabase commercial license
redirect_from:
  - /docs/latest/enterprise-guide/activating-the-enterprise-edition
  - /docs/latest/paid-features/activating-the-enterprise-edition
---

# Activating your Metabase commercial license

The [paid Pro and Enterprise editions](https://www.metabase.com/pricing/) of Metabase are distinct from the free [Open Source edition](../installation-and-operation/running-the-metabase-jar-file.md) and the [Starter version of Metabase Cloud](https://www.metabase.com/cloud/).

## If you're running on Metabase Cloud

If you've signed up for or upgraded to a Pro or Enterprise plan on Metabase Cloud, all of this will be taken care of for you.

## If you're self-hosting Metabase

To use your Pro/Enterprise features, you’ll need to do two things:

- Download Metabase Enterprise Edition
- Enter your license.

You can get a license by signing up for a free trial of the [Pro or Enterprise edition plans](https://www.metabase.com/pricing/), both of which can be self-hosted or hosted on Metabase Cloud.

### Download the Enterprise edition

- **Download Enterprise Edition**. You can download the latest Docker image or jar file from [Metabase releases](https://github.com/metabase/metabase/releases). Use the point version with the latest tag. We recommmend using Docker in production.
- **Set up your application database**. You'll also need to set up a dedicated [application database](../installation-and-operation/configuring-application-database.md) to store your Metabase data.

### Activate your license

There are two ways to activate your license when self-hosting Metabase:

- **When Metabase is running**: go to **Settings** > **Admin settings**, and click **License and Billing** in the lefthand sidebar. Paste in your license token under **License** and click **Activate**.

OR

- **Before you start Metabase**: you can also set the license token with the [`MB_PREMIUM_EMBEDDING_TOKEN` environment variable](../configuring-metabase/environment-variables.md#mb_premium_embedding_token). This environment variable must be set _before_ you start your Metabase.

## Upgrading from a self-hosted Metabase Open Source Edition to a Pro or Enterprise plan

To get all the features available when upgrading to a _self-hosted_ [Pro or Enterprise plan](https://www.metabase.com/pricing/), you'll need to:

1. Change to the Metabase Enterprise Edition (that goes for both the Pro and Enterprise plans).
2. Activate your license.

Assuming you've been using a [production application database](../installation-and-operation/configuring-application-database.md), you'll want to:

1. [Back up your application database](./backing-up-metabase-application-data.md).
2. Download the Enterprise Edition version that corresponds with your current Metabase version. So if you're running the Docker image for {{site.latest_version}}, you should switch to the Docker image for {{site.latest_enterprise}}. To see a list of available versions for both the Open Source and Enterprise Editions, check out [Metabase releases](https://github.com/metabase/metabase/releases).
3. Stop your current Metabase Open Source edition.
4. Swap in the Enterprise Edition Docker image or jar that you downloaded.
5. Start your Metabase like you normally would using the new Enterprise Edition image or jar. You don't need to do anything with your application database (which you've backed up in step one, right?).
6. [Activate your license](#activate-your-license). You won't be able to use any of the new features until you've activated your license.

Migrating to the Enterprise Edition will keep all of your questions, dashboards, people, settings — everything in your existing Metabase.

And don't stress. You won't lose any of your work, and if you get stuck, we're [here to help](https://www.metabase.com/help-premium).

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
java -Dhttps.proxyHost=[your proxy's hostname or ip] -Dhttps.proxyPort=[your proxy's port] -jar metabase.jar
```

or if you're using containers, then you need to use the `JAVA_TOOL_OPTIONS` environment variable:

```
JAVA_TOOL_OPTIONS=-Dhttps.proxyHost=[your proxy's hostname or ip] -Dhttps.proxyPort=[your proxy's port]
```

Depending on your organization’s setup, you may need to take additional configuration steps. If the command above doesn't work for you, we recommend reaching out to your internal infrastructure or dev ops teams for assistance.

## IP addresses to whitelist

If you're hosting Metabase behind a firewall that blocks outgoing connections, **you must allow outbound stateful connections to port 443 on the all of the following IP addresses**:

```
23.23.111.13
44.199.18.109
44.212.138.188
```

To verify your license with a token check to `token-check.metabase.com`, your Metabase will make GET HTTP requests to these IP addresses and parse their responses. If you can't allow outbound connections for security reasons, please [contact us](https://www.metabase.com/help-premium).

## Note about Zscaler deployments

When Metabase is deployed inside infrastructure that uses Zscaler, you should do the following:

1. Contact your networking team and let them know that Metabase will need to perform token checks in order for paid features to work. If you need an air-gapped version of Metabase, [contact us](https://www.metabase.com/help-premium).
2. Make sure Zscaler isn't acting as a proxy or DNS for the server where Metabase is running. Metabase needs a direct connection to the token check service without any gateway acting as a proxy.
3. Make sure the server where Metabase is running isn't using Zscaler root CA certificates for all websites. Otherwise, the Java virtual machine where Metabase runs will determine that the certificate authority is incorrect.
