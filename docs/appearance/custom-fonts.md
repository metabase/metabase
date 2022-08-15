---
title: Custom fonts
---

## Custom fonts

Add a custom font if you can't find your favorite among the [included fonts](./fonts#included-fonts).

1. Click on the **gear** icon and select **Admin settings** > **Settings** > **Appearance**.
2. Go to **Font** and select **Custom...**.
3. Enter URLs to your font files.

## Font style options

You can set three different font styles with three different URLs, one for each font style (size and weight) that Metabase will use in order to display its user interface properly. The font weights are:

- Regular 400
- Bold 700
- Heavy 900 (sometimes called Black 900)

You only need to set the first style (Regular 400); the browser will fill in the other styles.

For best results, set at least the 400 and 700 styles. If you have a single font file that contains multiple font styles within the same family, enter the URL in multiple fields to tell Metabase to prefer the weights in that font file. Metabase will use those styles to override the font styles set by the browser.

## Supported font file formats

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

## Further reading

- [White labeling Metabase](./whitelabeling.html)