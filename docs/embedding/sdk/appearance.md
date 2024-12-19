---
title: "Embedded analytics SDK - appearance"
---

# Embedded analytics SDK - appearance

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

You can style your embedded Metabase components with a theme.

Here's an example that includes the various styling options available:

```js
import { defineMetabaseTheme } from "@metabase/embedding-sdk-react";

const theme = defineMetabaseTheme({
  // Specify a font to use from the set of fonts supported by Metabase.
  // You can set the font to "Custom" to use the custom font
  // configured in your Metabase instance.
  fontFamily: "Lato",

  // Override the base font size for every component.
  // This does not usually need to be set, as the components
  // inherit the font size from the parent container, such as the body.
  fontSize: "16px",

  // Override the base line height for every component.
  lineHeight: 1.5,

  // Match your application's color scheme
  colors: {
    // The primary color of your application
    brand: "#9B5966",

    // Lighter variation of the brand color. Used for hover and accented elements.
    "brand-hover": "#DDECFA",

    // Lightest variation of the brand color. Used for hover and accented elements.
    "brand-hover-light": "#EEF6FC",

    // The color of text that is most prominent
    "text-primary": "#4C5773",

    // The color of text that is less prominent
    "text-secondary": "#696E7B",

    // The color of text that is least prominent
    "text-tertiary": "#949AAB",

    // Default background color
    background: "#FFFFFF",

    // Slightly muted background color.
    "background-secondary": "#EDF2F5",

    // Slightly darker background color used for hover and accented elements
    "background-hover": "#F9FBFC",

    // Muted background color used for disabled elements, such as disabled buttons and inputs.
    "background-disabled": "#F3F5F7",

    // Color used for borders
    border: "#EEECEC",

    // Color used for filters context
    filter: "#7172AD",

    // Color used for aggregations and breakouts context
    summarize: "#88BF4D",

    // Color used to indicate successful actions and positive values/trends
    positive: "#BADC58",

    // Color used to indicate dangerous actions and negative values/trends
    negative: "#FF7979",

    /** Color used for popover shadows */
    shadow: "rgba(0,0,0,0.08)",

    // Overrides the chart colors. Supports up to 8 colors
    // Limitation: this does not affect charts with custom series color
    charts: [
      // can either be a hex code
      "#9B59B6",

      // or a color object. tint and shade represents lighter and darker variations
      // only base color is required, while tint and shade are optional
      { base: "#E74C3C", tint: "#EE6B56", shade: "#CB4436" },
    ],
  },

  components: {
    // Dashboard
    dashboard: {
      // Background color for all dashboards
      backgroundColor: "#2F3640",

      card: {
        // Background color for all dashboard cards
        backgroundColor: "#2D2D30",

        // Apply a border color instead of shadow for dashboard cards.
        // Unset by default.
        border: "1px solid #EEECEC",
      },
    },

    // Question
    question: {
      // Background color for all questions
      backgroundColor: "#2D2D30",
    },

    // Tooltips
    tooltip: {
      // Tooltip text color.
      textColor: "#FFFFFF",

      // Secondary text color shown in the tooltip, e.g. for tooltip headers and percentage changes.
      secondaryTextColor: "#949AAB",

      // Tooltip background color.
      backgroundColor: "#2E353B",

      // Tooltip background color for focused rows.
      focusedBackgroundColor: "#0A0E10",
    },

    // Data table
    table: {
      cell: {
        // Text color of cells, defaults to `text-primary`
        textColor: "#4C5773",

        // Default background color of cells, defaults to `background`
        backgroundColor: "#FFFFFF",

        // Font size of cell values, defaults to ~12.5px
        fontSize: "12.5px",
      },

      idColumn: {
        // Text color of ID column, defaults to `brand`
        textColor: "#9B5966",

        // Background color of ID column, defaults to a lighter shade of `brand`
        backgroundColor: "#F5E9EB",
      },
    },

    // Number chart
    number: {
      // Value displayed on number charts.
      // This also applies to the primary value in trend charts.
      value: {
        fontSize: "24px",
        lineHeight: "21px",
      },
    },

    // Cartesian chart
    cartesian: {
      // Padding around the cartesian charts.
      // Uses CSS's `padding` property format.
      padding: "4px 8px",
    },

    // Pivot table
    pivotTable: {
      cell: {
        // Font size of cell values, defaults to ~12px
        fontSize: "12px",
      },

      // Pivot row toggle to expand or collapse row
      rowToggle: {
        textColor: "#FFFFFF",
        backgroundColor: "#95A5A6",
      },
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
    },

    // Popover are used in components such as click actions in interactive questions.
    popover: {
      // z-index of the popover. Useful for embedding components in a modal. defaults to 4.
      zIndex: 4,
    },
  },
});
```

### Customizing loader and error components

You can provide your own components for loading and error states by specifying `loaderComponent` and `errorComponent` as props to `MetabaseProvider`.

```tsx
import { MetabaseProvider, StaticDashboard } from "@metabase/embedding-sdk-react";

<MetabaseProvider
  loaderComponent={() => <div>Analytics is loading...</div>}
  errorComponent={({ message }) => <div>There was an error: {message}</div>}
>
  <StaticDashboard dashboardId={1} />
</MetabaseProvider>
```
