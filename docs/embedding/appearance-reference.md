---
title: Appearance reference
summary: "Reference for the theme object that styles modular embeds, including top-level options, colors, chart colors, and per-component overrides."
---

# Appearance reference

This page lists every option in the `theme` object. The same object works for web components (in `defineMetabaseConfig()`) and the React SDK (in `defineMetabaseTheme()`).

To add a theme to your embeds, see [Customize the appearance of your embeds](./appearance.md).

{% include plans-blockquote.html feature="Advanced theme options" is_plural=true %}

All the options except `preset` require a Pro or Enterprise plan.

## Example theme

This example sets every option in the theme object. See the tables below for more information on each option.

```js
{
  preset: "light",
  fontFamily: "Lato",
  fontSize: "16px",
  lineHeight: 1.5,
  colors: {
    brand: "#9B5966",
    "brand-hover": "#DDECFA",
    "brand-hover-light": "#EEF6FC",
    "text-primary": "#4C5773",
    "text-secondary": "#696E7B",
    "text-tertiary": "#949AAB",
    "text-white": "#FFFFFF",
    "text-hover": "#FFFFFF",
    background: "#FFFFFF",
    "background-secondary": "#EDF2F5",
    "background-hover": "#F9FBFC",
    "background-disabled": "#F3F5F7",
    "background-light": "#F0F2F5",
    "background-error": "#FDEDED",
    border: "#EEECEC",
    shadow: "rgba(0, 0, 0, 0.08)",
    focus: "#CAE1F7",
    filter: "#7172AD",
    summarize: "#88BF4D",
    positive: "#BADC58",
    negative: "#FF7979",
    error: "#ED6E6E",
    charts: [
      "#9B59B6",
      { base: "#E74C3C", tint: "#EE6B56", shade: "#CB4436" },
    ],
  },
  components: {
    dashboard: {
      backgroundColor: "#2F3640",
      gridBorderColor: "#EEECEC",
      card: {
        backgroundColor: "#2D2D30",
        border: "1px solid #EEECEC",
      },
    },
    question: {
      backgroundColor: "#2E353B",
      toolbar: {
        backgroundColor: "#F3F5F7",
      },
    },
    table: {
      stickyBackgroundColor: "#FFFFFF",
      stripedBackgroundColor: "#F9FBFC",
      cell: {
        textColor: "#4C5773",
        backgroundColor: "#FFFFFF",
        fontSize: "12.5px",
      },
      idColumn: {
        textColor: "#9B5966",
        backgroundColor: "#F5E9EB",
      },
    },
    pivotTable: {
      cell: {
        fontSize: "12px",
      },
      rowToggle: {
        textColor: "#FFFFFF",
        backgroundColor: "#95A5A6",
      },
    },
    number: {
      value: {
        fontSize: "24px",
        lineHeight: "21px",
      },
    },
    cartesian: {
      padding: "4px 8px",
      label: {
        fontSize: "13px",
      },
      splitLine: {
        lineStyle: {
          color: "#EEECEC",
        },
      },
    },
    tooltip: {
      textColor: "#FFFFFF",
      secondaryTextColor: "#949AAB",
      backgroundColor: "#2E353B",
      focusedBackgroundColor: "#0A0E10",
    },
    popover: {
      zIndex: 200,
    },
    collectionBrowser: {
      breadcrumbs: {
        expandButton: {
          textColor: "#8118F4",
          backgroundColor: "#767D7C",
          hoverTextColor: "#CE8C8C",
          hoverBackgroundColor: "#69264B",
        },
      },
      emptyContent: {
        icon: {
          width: "117px",
          height: "94px",
        },
        title: {
          fontSize: "1.5rem",
        },
        subtitle: {
          fontSize: "1rem",
        },
      },
    },
  },
}
```

## Theme options

| Option       | Type                  | What it does                                                                                                                                                                            |
| ------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preset`     | `"light"` or `"dark"` | The theme preset to use as a base. Available on all plans.                                                                                                                              |
| `fontFamily` | string                | The font for all text. Accepts any [font that Metabase supports](../configuring-metabase/fonts.md), or `"Custom"` to use your instance's custom font. Defaults to your instance's font. |
| `fontSize`   | string                | The base font size, in `px`, `em`, or `rem`. Defaults to about 14px (`0.875em`). Components inherit the font size from their container.                                                 |
| `lineHeight` | string or number      | The base line height.                                                                                                                                                                   |
| `colors`     | object                | The color palette. See [Colors](#colors).                                                                                                                                               |
| `components` | object                | Overrides for individual components and visualizations. See [Component options](#component-options).                                                                                    |

## Colors

Each option in the `colors` object accepts any CSS color string.

| Color                  | What it does                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `brand`                | The primary brand color, used for buttons and links.                                 |
| `brand-hover`          | A lighter variation of the brand color, used for hover and accented elements.        |
| `brand-hover-light`    | The lightest variation of the brand color, used for hover and accented elements.     |
| `text-primary`         | The main text color. Should have the most contrast with the background.              |
| `text-secondary`       | A lighter variation of dark text on light elements.                                  |
| `text-tertiary`        | Muted text for placeholders and disabled elements.                                   |
| `text-white`           | White text.                                                                          |
| `text-hover`           | Some button text on hover.                                                           |
| `background`           | The default background color.                                                        |
| `background-secondary` | A slightly muted background color.                                                   |
| `background-hover`     | A slightly darker background color, used for hover and accented elements.            |
| `background-disabled`  | A muted background color for disabled elements, such as disabled buttons and inputs. |
| `background-light`     | A light background color for some controls, like a radio group.                      |
| `background-error`     | Error backgrounds. Defaults to light red.                                            |
| `border`               | Borders.                                                                             |
| `shadow`               | Popover shadows.                                                                     |
| `focus`                | The outline on elements in focus.                                                    |
| `filter`               | The filter context.                                                                  |
| `summarize`            | The aggregation and breakout context.                                                |
| `positive`             | Successful actions and positive values or trends.                                    |
| `negative`             | Dangerous actions and negative values or trends.                                     |
| `error`                | Error icons and borders. Defaults to red.                                            |
| `charts`               | The chart series colors, up to eight. See [Chart colors](#chart-colors).             |

### Chart colors

Each entry in `colors.charts` is either a color string or an object with the following keys:

| Key     | What it does                           |
| ------- | -------------------------------------- |
| `base`  | Required. The series color.            |
| `tint`  | A lighter variation of the base color. |
| `shade` | A darker variation of the base color.  |

```js
colors: {
  charts: [
    "#9B59B6",
    { base: "#E74C3C", tint: "#EE6B56", shade: "#CB4436" },
  ],
}
```

If you set a custom series color in a chart's visualization settings, that color overrides the theme.

## Component options

Each component in the `components` object has its own table below. Dotted keys are nested objects, so `card.backgroundColor` under `dashboard` expands to:

```js
components: {
  dashboard: {
    card: {
      backgroundColor: "#2D2D30",
    },
  },
}
```

### `dashboard`

| Option                 | What it does                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `backgroundColor`      | The background color of all dashboards.                                                                                         |
| `gridBorderColor`      | The border color of the dashboard grid, shown only when editing dashboards. Defaults to `colors.border`.                        |
| `card.backgroundColor` | The background color of all dashboard cards.                                                                                    |
| `card.border`          | A CSS border for dashboard cards, like `"1px solid #EEECEC"`. Replaces the card's drop shadow. Cards have no border by default. |

### `question`

| Option                    | What it does                                  |
| ------------------------- | --------------------------------------------- |
| `backgroundColor`         | The background color of all questions.        |
| `toolbar.backgroundColor` | The background color of the question toolbar. |

### `table`

| Option                     | What it does                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `stickyBackgroundColor`    | The background color of the table header that stays fixed while scrolling. Defaults to white if no cell background color is set.         |
| `stripedBackgroundColor`   | The background color of every other row when the **Striped rows** table setting is on. Defaults to a subtle tint of the cell background. |
| `cell.textColor`           | The text color of cells. Defaults to `colors.text-primary`.                                                                              |
| `cell.backgroundColor`     | The background color of cells. Defaults to `colors.background`.                                                                          |
| `cell.fontSize`            | The font size of cell values. Defaults to about `12.5px`.                                                                                |
| `idColumn.textColor`       | The text color of the ID column. Defaults to `colors.brand`.                                                                             |
| `idColumn.backgroundColor` | The background color of the ID column. Defaults to a lighter shade of `colors.brand`.                                                    |

### `pivotTable`

| Option                      | What it does                                                 |
| --------------------------- | ------------------------------------------------------------ |
| `cell.fontSize`             | The font size of cell values. Defaults to about 12px.        |
| `rowToggle.textColor`       | The text color of the button that expands or collapses rows. |
| `rowToggle.backgroundColor` | The background color of that button.                         |

### `number`

| Option             | What it does                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `value.fontSize`   | The font size of the value on number charts. Also applies to the primary value in trend charts. |
| `value.lineHeight` | The line height of that value.                                                                  |

### `cartesian`

Applies to line, bar, area, combo, scatter, and waterfall charts.

| Option                      | What it does                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `padding`                   | Padding around the chart, in CSS `padding` format, like `"4px 8px"`. |
| `label.fontSize`            | The font size of axis ticks and series labels.                       |
| `splitLine.lineStyle.color` | The color of the grid lines.                                         |

### `tooltip`

| Option                   | What it does                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `textColor`              | The tooltip text color.                                                            |
| `secondaryTextColor`     | The secondary text color in tooltips, like tooltip headers and percentage changes. |
| `backgroundColor`        | The tooltip background color.                                                      |
| `focusedBackgroundColor` | The tooltip background color for focused rows.                                     |

### `popover`

| Option   | What it does                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zIndex` | The z-index of overlays, like click-action menus and save dialogs. Defaults to `200`. See [Fix overlays hidden behind your app's modals](./appearance.md#fix-overlays-hidden-behind-your-apps-modals). |

### `collectionBrowser`

| Option                                          | What it does                                            |
| ----------------------------------------------- | ------------------------------------------------------- |
| `breadcrumbs.expandButton.textColor`            | The text color of the breadcrumb expand button.         |
| `breadcrumbs.expandButton.backgroundColor`      | The background color of the breadcrumb expand button.   |
| `breadcrumbs.expandButton.hoverTextColor`       | The text color of the expand button on hover.           |
| `breadcrumbs.expandButton.hoverBackgroundColor` | The background color of the expand button on hover.     |
| `emptyContent.icon.width`                       | The width of the icon shown when a collection is empty. |
| `emptyContent.icon.height`                      | The height of that icon.                                |
| `emptyContent.title.fontSize`                   | The font size of the empty-collection title.            |
| `emptyContent.subtitle.fontSize`                | The font size of the empty-collection subtitle.         |

## Further reading

- [Customize the appearance of your embeds](./appearance.md)
- [Configure your embeds](./config.md)
- [Config reference](./config-reference.md)
- [Modular embedding components](./components.md)