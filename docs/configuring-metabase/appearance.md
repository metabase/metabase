---
title: Appearance
redirect_from:
  - /docs/latest/administration-guide/whitelabeling
  - /docs/latest/enterprise-guide/whitelabeling
  - /docs/latest/enterprise-guide/customize-embeds
  - /docs/latest/embedding/whitelabeling
  - /docs/latest/embedding/fonts
  - /docs/latest/embedding/customize-embeds
---

# Appearance

{% include plans-blockquote.html feature="Custom appearance" %}

Appearance settings give you the option to white label Metabase to match your company’s branding.

If you're looking for date, time, number, or currency formatting, see [Formatting defaults](../data-modeling/formatting.md).

## Changing Metabase's appearance

Click on the gear icon at the bottom of the navigation sidebar and select **Admin settings** > **Settings** > **Appearance**. Here’s what you can do:

## Application name

You can change every place in the app that says “Metabase” to something like “Acme Analytics,” or whatever you want to call your Metabase app.

## Font

This is the primary font used in charts and throughout the Metabase application (your "instance font"). See [Fonts](./fonts.md).

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

You can choose up to 24 hex values. If you choose fewer than 24 colors, Metabase will auto-generate colors to fill in the rest of the values. Now don't get confused about the order of colors you are selecting and thinking that these will get the same order on the chart. If you want to dive deeper on how metabase decides on selecting such colors. The below is a quick overview:

For chart colors, there’s this function [getColorsForValues](https://github.com/metabase/metabase/blob/b4d8ae8a8b1c77e78984eee2d4bea1f79bdae039/frontend/src/metabase/lib/colors/charts.ts#L5) , where it also use different different colors based on the number of colors in a chart (<=8 and >8). As for how the whole palette is generated, each color is generated from the color above when you press generate chart colors, the logic is defined [here](https://github.com/metabase/metabase/blob/b4d8ae8a8b1c77e78984eee2d4bea1f79bdae039/enterprise/frontend/src/metabase-enterprise/whitelabel/components/ChartColorSettings/utils.ts#L41)
 
Also the reason why the color order is not respected is because you define the colors and Metabase generates a lighter and darker variation, but in a chart with series Metabase checks the colors and sees if colors are similar to each other on the color that picked before or after, and then generates a new color. All the code for that is [here](https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/metabase-enterprise/whitelabel/components/ChartColorSettings/utils.ts)

Custom colors are unavailable for:

- [Number charts](../questions/sharing/visualizing-results.md#numbers)
- [Trend charts](../questions/sharing/visualizing-results.md#trends)
- [Funnel charts](../questions/sharing/visualizing-results.md#funnel-charts)
- Conditional formatting ([tables](../questions/sharing/visualizing-results.md#tables) and [pivot tables](../questions/sharing/visualizing-results.md#pivot-tables))
- [Maps](../questions/sharing/visualizing-results.md#maps)

## Logo

You can replace Metabase’s familiar, tasteful, inspired-yet-not-threateningly-avant-garde dotted M logo with your very own logo. For things to work best, the logo you upload should be an SVG file that looks good when it’s around 60px tall. (In other words, ask the nearest designer for help.)

## Favicon

The URL or image that you want to use as the favicon. Note that if you use a relative path, that path isn't relative to the Metabase JAR, but to the webserver. So unless you're using a reverse-proxy, the path will be relative to the frontend resources available to the JAR.

## Landing page

The landing page is what people will see whenever they login. You can set the URL to a collection, question, dashboard or whatever, just make sure that everyone has access to that URL.

## Loading message

This message is the text Metabase presents when it's loading a query. Options include:

- "Doing science..." (the default)
- "Running query..."
- "Loading results..."

## Metabot

![Metabot toggle](./images/metabot.png)

You can decide whether to display our little friend on the home page.

## Lighthouse illustration

Show the Metabase lighthouse image on the home and login pages.

## Further reading

- [Customer-facing analytics](https://www.metabase.com/learn/customer-facing-analytics).
- [Embedding introduction](../embedding/start.md).
- [Brand your Metabase](https://www.metabase.com/learn/embedding/brand).
