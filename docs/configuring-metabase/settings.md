---
title: General settings
redirect_from:
  - /docs/latest/administration-guide/08-configuration-settings
---

# General settings

_Admin > Settings > General_

This section contains settings for your whole instance, like its URL, the reporting timezone, and toggles for disabling or enabling some of Metabase's optional features.
You can configure these settings by clicking the **grid icon** in the upper right, then going to **Admin** > **Settings** > **General**.

## Site name

How you’d like to refer to this instance of Metabase.

## Site URL

The site URL is the web address that people use to access your Metabase instance. Make sure to include `http://` or `https://` to make sure it’s reachable. This feature is only available for self-hosted Metabases. For customers on Metabase Cloud, check out [Custom domains](../cloud/custom-domain.md).

### Redirect to HTTPS

By default, Metabase is served over HTTP.

To force all traffic to use HTTPS via redirect, click `http://` (under the **Site URL** section) and select `https://` from the dropdown menu.

For example, say you enable HTTPS redirect for a Metabase instance at the site URL "example.com". When someone enters an address like `example.com/data` in their browser's address bar, they'll get automatically redirected to a secure connection at `https://example.com/data`.

> Note: if you haven't set up HTTPS on your server, Metabase will not let you enable HTTPS redirect. Instead, you'll get a warning saying "It looks like HTTPS is not properly configured."

## Homepage

Set the page people see when they first log in to your Metabase. Choose between:

- **Default Metabase home**: The standard Metabase homepage.
- **Dashboard**: Pick a dashboard to serve as the homepage. If people lack permissions to view the selected dashboard, Metabase will redirect them to the default homepage.
- **Custom URL**: Send people to a specific URL (a collection, question, dashboard, or other page). Make sure people have access to the URL. This option is only available on Metabase [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans.

## Email address for help requests

This email address will be displayed in various messages throughout Metabase when users encounter a scenario where they need assistance from an admin, such as a password reset request.

## Usage tracking

### Send anonymous tracking data to Metabase

On self-hosted Metabases, this option determines whether or not you allow [anonymous data about your usage of Metabase](../installation-and-operation/information-collection.md) to be sent back to us to help us improve the product. [Your database’s data is never tracked or sent](https://www.metabase.com/security).

### Collect user data to display in usage analytics

{% include plans-blockquote.html feature="Collecting user data" %}

You can switch on logging of IP addresses, user agents, embed path, query parameters, and Metabot conversation metadata for people using your Metabase, both for people directly by logging into Metabase, or for people who view an embedded Metabase component in your app. If enabled, you can find this information in your [usage analytics](../usage-and-performance-tools/usage-analytics.md).

By default, collection of user data is turned **off**.

## Friendly table and field names

By default, Metabase attempts to make field and table names more readable by changing things like `somehorriblename` to `Some Horrible Name`. This does not work well for languages other than English, or for fields that have lots of abbreviations or codes in them. If you'd like to turn this setting off, you can do so from the Admin Panel under **Admin** **> Settings** > **General**.

If you re-enable this setting, Metabase will run a [scan](../databases/sync-scan.md#how-database-scans-work) against your database to review your table and column names again.

To manually label field or table names in Metabase, check out the [Table Metadata](../data-modeling/metadata-editing.md) section in your admin panel. Metadata in the Table Metadata can be further curated in [models](../data-modeling/models.md).

## Enable X-rays

[X-rays](../exploration-and-organization/x-rays.md) are a great way for people to get quick summary stats on your data. If these X-ray queries get too slow or expensive, you can turn them off here.

## Allowed domains for iframes in dashboards

Make sure you trust the sources that you allow people to embed in dashboards.

You can include multiple domains separated by a comma. Including a subdomain is more restrictive than including the domain.

- For **Domains**, (e.g., `example.com`), Metabase will allow any iframe from the domain (`example.com`) _and_ its subdomains (e.g., `data.example.com`, `docs.example.com`, etc.).
- For **Subdomains** (e.g., `data.example.com`) Metabase will restrict iframes to those subdomains. In this case, iframes _must_ be from `data.example.com` (or any of the other allowed domains). Metabase will block iframes from all other subdomains, including `example.com`.

So if you included the following:

```
data.example.com,
docs.example.com
```

Metabase would only allow iframes from `data.example.com` and `docs.example.com`. Metabase would block iframes from all other domains, including iframes from `example.com` and its other subdomains.

See [iframes in dashboards](../dashboards/introduction.md#iframe-cards).

## Restrict image domains

When on, Metabase restricts the browser's Content Security Policy so images can only load from this Metabase instance or the domains listed in [Allowed domains for images](#allowed-domains-for-images).

By default, images from any domain are allowed.

You must turn on this setting to enable [Custom visualizations](../questions/visualizations/custom.md). While custom visualizations are enabled, you can't turn it back off.

## Allowed domains for images

When the [Restrict image domains](#restrict-image-domains) setting is on, Metabase will only allow images served from this Metabase instance, and any domains listed on this page.

Leave this input empty to only allow images hosted by your Metabase instance.

Add multiple domains separated by a comma. Domains follow the same matching rules as [Allowed domains for iframes in dashboards](#allowed-domains-for-iframes-in-dashboards): listing a domain like `example.com` also allows its subdomains, while listing a subdomain like `images.example.com` allows only that subdomain.
