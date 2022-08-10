---
title: Customizing embedded charts
redirect_from:
  - /docs/latest/enterprise-guide/customize-embeds
---

# Customizing embedded charts

{% include plans-blockquote.html feature="Advanced embedding features" %}

Some paid plans give you additional customization options for [embedded items](../administration-guide//13-embedding.md).

## Remove the "Powered by Metabase" banner

![Powered by Metabase](./images/powered-by-metabase.png)

Charts and dashboards won't show the branded Metabase label at the bottom.

## Setting fonts for embedded items

You can set the font for the embedded chart or dashboard. You can select from a list of [included fonts](./fonts.md).

If you've set a custom font for your Metabase, that font will be selectable as "Use instance font".

### Use instance font

If you select "Use instance font", the font for your embedded item will sync with whatever you've set your [Metabase font](./fonts.md) to. So if you change the font for your Metabase (your "instance"), the font used for the embedded item will change as well. There's no need to update the embedding code; the embedded item's font should update automatically (though you may need to refresh your browser).

If you want to use a font different from your current instance font, you can select one of the [included fonts](./fonts.md). You cannot have multiple custom fonts.

### Changing custom fonts

If you want to use a different custom font, and by custom here we mean a font other than one of the included fonts, you'll need to change the [custom font](./fonts.md#custom-fonts) for your Metabase instance. Changing the instance font will update all embedded items that have their font set to "Use instance font".

For now, you cannot have multiple custom fonts; you can only override your instance font with one of the included fonts.

## Disable data download

You can remove the export icon from charts. Note that removing the icon here doesn't totally prevent people from exporting the data; treat it as a deterrent, not a security option. Removing the icon just cleans up the embedded chart a bit, and makes downloading the data a bit of a hassle.

## Further reading

- [Embedding Metabase in other applications](../administration-guide/13-embedding.md)
- [White labeling Metabase](./whitelabeling.md)
- [Fonts](./fonts.md)
- [Learn embedding](https://www.metabase.com/learn/embedding)

