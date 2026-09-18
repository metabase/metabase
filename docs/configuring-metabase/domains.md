---
title: Allow iframes and images from other domains
summary: Let people embed iframes from sites you trust in dashboards, and control which domains images can load from in text cards, descriptions, and custom visualizations.
---

# Allow iframes and images from other domains

_Admin > Settings > Domains_

By default, Metabase only lets dashboards embed iframes from a short list of popular sites, and lets images load from anywhere. Admins can allow iframes from more sites, or lock images down to trustworthy domains.

> To change the web address people use to reach your Metabase, see [Changing your domain name](../cloud/custom-domain.md). On self-hosted Metabases, set the [Site URL](./settings.md#site-url).

## Allow iframes from a site in dashboards

_Admin > Settings > Domains_

If someone adds an [iframe card](../dashboards/introduction.md#iframe-cards) to a dashboard and Metabase blocks it, the site isn't on the allowlist. To allow it:

1. Under **Allowed domains for iframes in dashboards**, add the site's domain (like `example.com`). Separate multiple domains with commas. See [How domain matching works](#how-domain-matching-works).
2. Click **Save changes**.

Only allow sites you trust. An iframe can show whatever the site serves, so anyone who can edit a dashboard can put that content in front of everyone who views it.

Metabase ships with a starter list (YouTube, Loom, Vimeo, Google Docs, and a few others). You can add to that list or clear it entirely. Listing `example.com` also allows its subdomains, while listing `data.example.com` allows only that subdomain. See [How domain matching works](#how-domain-matching-works).

You can also set the list with the [`MB_ALLOWED_IFRAME_HOSTS`](./environment-variables.md#mb_allowed_iframe_hosts) environment variable.

## Restrict where images can load from

_Admin > Settings > Domains_

People can link to images in [dashboard text cards](../dashboards/dashboard-markdown.md#add-an-image), entity descriptions, and [custom visualizations](../questions/visualizations/custom.md). If you don't want those images to load from just anywhere, you can restrict them to your Metabase instance plus domains you choose. You'll also need to do this before you can turn on custom visualizations, since this restriction is required to limit where a visualization's code can send outbound asset requests.

1. Turn on **Restrict image domains**.
2. Under **Allowed domains for images**, add the domains images can load from (like `images.example.com`). Separate multiple domains with commas. Leave the list empty to only allow images hosted by your Metabase instance. See [How domain matching works](#how-domain-matching-works).
3. Click **Save changes**.

Under the hood, this sets the browser's Content Security Policy so images can only load from your Metabase instance, the map tile server that map visualizations use, and any domains you allow. You don't need to add the map tile server yourself.

While custom visualizations are enabled, you can't turn off **Restrict image domains**. Disable custom visualizations first.

You can also set these with the [`MB_CSP_IMG_ENABLED`](./environment-variables.md#mb_csp_img_enabled) and [`MB_CSP_IMG_ALLOWED_HOSTS`](./environment-variables.md#mb_csp_img_allowed_hosts) environment variables.

## How domain matching works

Both allowlists use the same rules. Including a subdomain is more restrictive than including the domain.

- A **domain** like `example.com` allows the domain itself _and_ all of its subdomains (`data.example.com`, `docs.example.com`, and so on).
- A **subdomain** like `data.example.com` allows only that subdomain. Metabase blocks everything else, including `example.com` itself and its other subdomains.

So if your allowlist is:

```
data.example.com,
docs.example.com
```

Metabase only allows `data.example.com` and `docs.example.com`. It blocks `example.com` and every other subdomain.
