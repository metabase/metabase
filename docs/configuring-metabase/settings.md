---
title: General settings
redirect_from:
  - /docs/latest/administration-guide/08-configuration-settings
---

# General settings

This section contains settings for your whole instance, like its URL, the reporting timezone, and toggles for disabling or enabling some of Metabase's optional features.

You can configure these settings from **Settings** > **Admin Settings** > **General**.

## Site name

How you’d like to refer to this instance of Metabase.

## Site URL

The site URL is the web address that people use to access your Metabase instance. Make sure to include `http://` or `https://` to make sure it’s reachable. This feature is only available for self-hosted Metabases. For customers on Metabase Cloud, check out [Custom domains](https://www.metabase.com/docs/latest/cloud/custom-domain).

## Custom homepage

Admins can pick a dashboard to serve as the homepage. If people lack permissions to view the selected dashboard, Metabase will redirect them to the default homepage.

If you've set a dashboard as your homepage, and want to revert to the default Metabase homepage, simply turn off the **Enabled** toggle to disable the Custom Homepage feature.

## Redirect to HTTPS

By default, Metabase is served over HTTP.

To force all traffic to use HTTPS via redirect, click `http://` (under the **Site URL** section) and select `https://` from the dropdown menu.

For example, say you enable HTTPS redirect for a Metabase instance at the site URL "example.com". When someone enters an address like `example.com/data` in their browser's address bar, they'll get automatically redirected to a secure connection at `https://example.com/data`.

> Note: if you haven't set up HTTPS on your server, Metabase will not let you enable HTTPS redirect. Instead, you'll get a warning saying "It looks like HTTPS is not properly configured."

## Email address for help requests

This email address will be displayed in various messages throughout Metabase when users encounter a scenario where they need assistance from an admin, such as a password reset request.

## Anonymous tracking

This option turns determines whether or not you allow [anonymous data about your usage of Metabase](../installation-and-operation/information-collection.md) to be sent back to us to help us improve the product. [Your database’s data is never tracked or sent](https://www.metabase.com/security).

## Friendly table and field names

By default, Metabase attempts to make field and table names more readable by changing things like `somehorriblename` to `Some Horrible Name`. This does not work well for languages other than English, or for fields that have lots of abbreviations or codes in them. If you'd like to turn this setting off, you can do so from the Admin Panel under **Settings** > **Admin settings** > **General**.

If you re-enable this setting, Metabase will run a [scan](../databases/sync-scan.md#how-database-scans-work) against your database to review your table and column names again.

To manually label field or table names in Metabase, check out the [Table Metadata](../data-modeling/metadata-editing.md) section in your admin settings. Metadata in the Table Metadata can be further curated in [models](../data-modeling/models.md).

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
