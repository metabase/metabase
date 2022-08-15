---
title: Introduction
redirect_from:
  - /docs/latest/administration-guide/whitelabeling
  - /docs/latest/enterprise-guide/whitelabeling
---

# Introduction

{% include plans-blockquote.html feature="Appearance" %}

From your Metabase homepage, click the **gear icon** and select **Admin settings** > **Settings** > **Appearance**. Here's what you can customize:

## Application name

You can change every place in the app that says “Metabase” to something like “Acme Analytics,” or whatever you want to call your Metabase app.

## Background image

Show the Metabase lighthouse image on the home and login pages.

## Color palette

You can customize colors in both the application UI and in the Metabase charts.

### User interface colors

![User interface colors](./images/user-interface-colors.png)

You can customize the colors that Metabase uses throughout the app:

- **First color:** The main color used throughout the app for buttons, links, and the default chart color.
- **Second color:** The color of aggregations and breakouts in the graphical query builder.
- **Third color:** Color of filters in the query builder, buttons and links in filter widgets.

### Chart colors

![Chart colors](./images/chart-colors.png)

You can choose up to 24 hex values. If you choose fewer than 24 colors, Metabase will auto-generate colors to fill in the rest of the values.

## Disable data download

**Only available for [embedded](../embedding/start) charts.**

You can remove the export icon from charts. Note that removing the icon here doesn't totally prevent people from exporting the data; treat it as a deterrent, not a security option. Removing the icon just cleans up the embedded chart, and makes downloading the data a bit of a hassle.

## Favicon

The URL or image that you want to use as the favicon. Note that if you use a relative path, that path isn't relative to the Metabase JAR, but to the webserver. So unless you're using a reverse-proxy, the path will be relative to the frontend resources available to the JAR.

## [Font](./fonts.html)

Change the font used in charts and throughout the Metabase application.

## Landing page

The landing page is what people will see whenever they login. You can set the URL to a collection, question, dashboard or whatever, just make sure that everyone has access to that URL.

## Loading message

This message is the text Metabase presents when it's loading a query. Options include:

- "Doing science..." (the default)
- "Running query..."
- "Loading results..."

## Logo

You can replace Metabase’s familiar, tasteful, inspired-yet-not-threateningly-avant-garde dotted M logo with your very own logo. For things to work best, the logo you upload should be an SVG file that looks good when it’s around 60px tall. (In other words, ask the nearest designer for help.)

## Metabot

![Metabot toggle](./images/metabot.png)

You can decide whether to display our little friend on the home page.

## "Powered by Metabase" banner

**Only available for [embedded](../embedding/start) charts.**

![Powered by Metabase](./images/powered-by-metabase.png)

Choose whether to remove the branded Metabase label from your charts and dashboards.

## Further reading

- [Brand your Metabase](https://www.metabase.com/blog/white-label/index.html).
