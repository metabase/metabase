---
title: Fonts
redirect_from:
  - /docs/latest/enterprise-guide/fonts
  - /docs/latest/embedding/fonts
---

# Fonts

{% include plans-blockquote.html feature="Customizable font" %}

On Pro and Enterprise plans, you can customize the font Metabase uses (the default is [Lato](https://fonts.google.com/specimen/Lato)). You can choose from a curated set of Google Fonts that accommodate the regular, bold, and heavy font weights that Metabase relies on for its various UI elements.

## Included fonts

To change your Metabase font, click on the **gear** icon in the upper right of the screen and select **Admin settings** > **Settings** > **Appearance**. Under **Font**, select from a list of included fonts.

- [Custom font](#custom-fonts)
- [Lato](https://fonts.google.com/specimen/Lato)
- [Lora](https://fonts.google.com/specimen/Lora)
- [Merriweather](https://fonts.google.com/specimen/Merriweather)
- [Montserrat](https://fonts.google.com/specimen/Montserrat)
- [Noto Sans](https://fonts.google.com/specimen/Noto+Sans)
- [Open Sans](https://fonts.google.com/specimen/Open+Sans)
- [Oswald](https://fonts.google.com/specimen/Oswald)
- [Playfair Display](https://fonts.google.com/specimen/Playfair+Display)
- [Poppins](https://fonts.google.com/specimen/Poppins)
- [PT Sans](https://fonts.google.com/specimen/PT+Sans)
- [PT Serif](https://fonts.google.com/specimen/PT+Serif)
- [Raleway](https://fonts.google.com/specimen/Raleway)
- [Roboto](https://fonts.google.com/specimen/Roboto)
- [Roboto Condensed](https://fonts.google.com/specimen/Roboto+Condensed)
- [Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono)
- [Roboto Slab](https://fonts.google.com/specimen/Roboto+Slab)
- [Slabo 27px](https://fonts.google.com/specimen/Slabo+27px)
- Source Sans Pro
- [Ubuntu](https://fonts.google.com/specimen/Ubuntu)

Comic Sans is currently not included.

## Custom fonts

To set a custom font, click on the **gear** icon in the upper right of the screen and select **Admin settings** > **Settings** > **Appearance**.

For **Font**, select **Custom...** and enter URLs to your font files.

## Font style options

You can set three different font styles with three different URLs, one for each font style (size and weight) that Metabase will use in order to display its user interface properly. The font weights are:

- Regular 400
- Bold 700
- Heavy 900 (sometimes called Black 900)

You only need to set the first style (Regular 400); the browser will fill in the other styles.

For best results, set at least the 400 and 700 styles. If you have a single font file that contains multiple font styles within the same family, enter the URL in multiple fields to tell Metabase to prefer the weights in that font file. Metabase will use those styles to override the font styles set by the browser.

### Supported font file formats

For custom fonts, Metabase supports woff, woff2, ttf files. If the URL you provide lacks a specific file extension, Metabase will assume it's a woff2 file.

## Google Font URLs

To get a URL for a [Google Font](https://fonts.google.com/), visit the Google Font page and select the style you want to use. Then make an HTTP request to get the URL of the tff file. For example, say we want to use Roboto Mono: here's how we could get the font file URLs for both the 400 and 700 styles:

We'd paste the URL [https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap](https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap) into our browser's address bar. This URL will return a response like:

```
* cyrillic-ext */
@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/robotomono/v21/L0xTDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vrtSM1J-gEPT5Ese6hmHSV0me8iUI0lkQ.woff2) format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/robotomono/v21/L0xTDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vrtSM1J-gEPT5Ese6hmHSx0me8iUI0lkQ.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
...
```

For latin text, we'd copy the relevant src URLs for each style, in this case:

- For 400: [https://fonts.gstatic.com/s/robotomono/v21/L0xTDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vrtSM1J-gEPT5Ese6hmHSh0me8iUI0.woff2](https://fonts.gstatic.com/s/robotomono/v21/L0xTDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vrtSM1J-gEPT5Ese6hmHSh0me8iUI0.woff2)
- For 700: [https://fonts.gstatic.com/s/robotomono/v21/L0xTDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vrtSM1J-gEPT5Ese6hmHSh0me8iUI0.woff2](https://fonts.gstatic.com/s/robotomono/v21/L0xTDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vrtSM1J-gEPT5Ese6hmHSh0me8iUI0.woff2)

And paste those URLS in the relevant input fields in **Admin settings** > **Settings** > **Appearance** > **Font** section where it says "Tell us where to find the file for each font weight. You don’t need to include all of them, but it’ll look better if you do."

## Hosting fonts on GitHub

If you host a font on GitHub, the font should be in a public repository, and you'll need to link to the raw font file(s) served from the raw.githubusercontent.com domain.

For example, let's say you want to use the Inter typeface. The font is hosted at:

[https://github.com/rsms/inter/blob/master/docs/font-files/Inter-Regular.woff2](https://github.com/rsms/inter/blob/master/docs/font-files/Inter-Regular.woff2)

Then the link you'll need is:

[https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Regular.woff2](https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Regular.woff2)

Which follows the pattern:

```
raw.githubusercontent.com/${user}/${repo}/${branch}/${path}
```

Note that in the raw link, there is no `/blob/` directory in the URL.

## Supporting multiple languages

To support multiple character sets, for example both Latin and Cyrillic, you'll need to merge font files.

## Customizing the font for individual embedded items

In addition to the [included fonts](#included-fonts), if you set a custom font for your Metabase, that font will be selectable from "Use instance font" in [static embeds](../embedding/static-embedding.md).

## Further reading

- [Customizing Metabase's appearance](./appearance.md)
- [Customer-facing analytics](https://www.metabase.com/learn/customer-facing-analytics)
- [Embedding documentation](../embedding/start.md)
