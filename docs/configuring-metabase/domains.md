---
title: Domains
summary: Control which domains Metabase allows for iframes in dashboards and for images in text cards, descriptions, and custom visualizations.
---

# Domains

_Admin > Settings > Domains_

These settings control which external domains Metabase lets content load from: iframes in dashboard cards, and images in dashboard text cards, entity descriptions, and custom visualizations. To change them, click the **grid** icon in the upper right, then go to **Admin** > **Settings** > **Domains**.

> Looking to change the web address people use to reach your Metabase? On Metabase Cloud, see [Changing your domain name](../cloud/custom-domain.md). On self-hosted Metabases, set the [Site URL](./settings.md#site-url).

## Allowed domains for iframes in dashboards

Make sure you trust the sources that you allow people to embed in dashboards.

Metabase ships with a default list of popular domains (like YouTube, Loom, Vimeo, and Google Docs) that you can add to or clear. You can also set this list with the [`MB_ALLOWED_IFRAME_HOSTS`](./environment-variables.md#mb_allowed_iframe_hosts) environment variable.

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

When on, Metabase restricts the browser's Content Security Policy so images can only load from this Metabase instance, the map tile server used by map visualizations, or the domains listed in [Allowed domains for images](#allowed-domains-for-images).

By default, images from any domain are allowed.

You must turn on this setting to enable [Custom visualizations](../questions/visualizations/custom.md). While custom visualizations are enabled, you can't turn it back off.

You can also set this with the [`MB_CSP_IMG_ENABLED`](./environment-variables.md#mb_csp_img_enabled) environment variable.

## Allowed domains for images

When the [Restrict image domains](#restrict-image-domains) setting is on, Metabase will only allow images served from this Metabase instance, the map tile server used by map visualizations, and any domains listed here. This applies to images in [dashboard text cards](../dashboards/dashboard-markdown.md#add-an-image), entity descriptions, and [custom visualizations](../questions/visualizations/custom.md).

Leave this input empty to allow images hosted by your Metabase instance and the map tile server. The map tile server is always allowed so map visualizations keep working; you don't need to manually add it here.

Add multiple domains separated by a comma. Domains follow the same matching rules as [Allowed domains for iframes in dashboards](#allowed-domains-for-iframes-in-dashboards): listing a domain like `example.com` also allows its subdomains, while listing a subdomain like `images.example.com` allows only that subdomain.

You can also set this list with the [`MB_CSP_IMG_ALLOWED_HOSTS`](./environment-variables.md#mb_csp_img_allowed_hosts) environment variable.
