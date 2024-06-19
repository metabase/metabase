---
title: Activating your Metabase commercial license
redirect_from:
  - /docs/latest/enterprise-guide/activating-the-enterprise-edition
---

# Activating your Metabase commercial license

The [paid Pro and Enterprise editions](https://www.metabase.com/pricing) of Metabase are distinct from the free [Open Source edition](../installation-and-operation/running-the-metabase-jar-file.md) and the [Starter version of Metabase Cloud](https://www.metabase.com/cloud/).

To use your Pro/Enterprise features, you’ll need to first get a license. And if you want to self-host, you'll need a different JAR or Docker image that you can use to activate the advanced features with your license token.

## If you're running on Metabase Cloud

If you've signed up for or upgraded to a Pro or Enterprise plan on Metabase Cloud, all of this will be taken care of for you.

## Where to get a license

You can get a license by signing up for a free trial of the [Pro or Enterprise edition plans](https://www.metabase.com/pricing), both of which can be self-hosted or hosted on Metabase Cloud.

## How to activate your token when self-hosting

If you chose to host Metabase yourself, you'll get an email containing a unique license token. But to use it, you'll need to install the right JAR file.

You can either:

- [Download the latest metabase-enterprise JAR](https://downloads.metabase.com/enterprise/latest/metabase.jar) (the filename is the same, irrespective of your plan), or
- [Get the latest Docker image](https://hub.docker.com/r/metabase/metabase-enterprise/) at `metabase/metabase-enterprise:latest`.

Run Metabase as you would normally, then go to **Settings** > **Admin settings**, and click **License and Billing** in the lefthand sidebar. Paste in your license token under **License** and click **Activate**.

## **Validating your token**

To validate your token and maintain access to Pro/Enterprise features, your Metabase needs to be able to access the Internet, specifically:

```
https://token-check.metabase.com/api/[token-id]/v2/status
```

(substituting `[token-id]` with your token ID).

If your Metabase can't validate the token, it'll disable the Pro/Enterprise features, but will continue to work normally as if you were running the Open Source edition.

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
