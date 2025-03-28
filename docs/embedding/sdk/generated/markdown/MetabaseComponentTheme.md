```ts
type MetabaseComponentTheme = {
  cartesian: {
    goalLine: {
      label: {
        fontSize: string;
      };
    };
    label: {
      fontSize: string;
    };
    padding: string;
  };
  collectionBrowser: {
    breadcrumbs: {
      expandButton: {
        backgroundColor: ColorCssVariableOrString;
        hoverBackgroundColor: ColorCssVariableOrString;
        hoverTextColor: ColorCssVariableOrString;
        textColor: ColorCssVariableOrString;
      };
    };
    emptyContent: {
      icon: {
        height: CSSProperties["width"];
        width: CSSProperties["width"];
      };
      subtitle: {
        fontSize: CSSProperties["fontSize"];
      };
      title: {
        fontSize: CSSProperties["fontSize"];
      };
    };
  };
  dashboard: {
    backgroundColor: string;
    card: {
      backgroundColor: string;
      border: string;
    };
    gridBorderColor: string;
  };
  number: {
    value: {
      fontSize: CSSProperties["fontSize"];
      lineHeight: string;
    };
  };
  pivotTable: {
    cell: {
      fontSize: string;
    };
    rowToggle: {
      backgroundColor: string;
      textColor: string;
    };
  };
  popover: {
    zIndex: number;
  };
  question: {
    backgroundColor: string;
    toolbar: {
      backgroundColor: string;
    };
  };
  table: {
    cell: {
      backgroundColor: string;
      fontSize: string;
      textColor: string;
    };
    idColumn: {
      backgroundColor: string;
      textColor: string;
    };
    stickyBackgroundColor: string;
  };
  tooltip: {
    backgroundColor: string;
    focusedBackgroundColor: string;
    secondaryTextColor: string;
    textColor: string;
  };
};
```

Theme options for customizing specific Metabase
components and visualizations.

Every non-optional properties here must have a default value defined
in DEFAULT\_METABASE\_COMPONENT\_THEME at \[default-component-theme.ts]

#### Properties

##### cartesian

```ts
cartesian: {
  goalLine: {
    label: {
      fontSize: string;
    }
  }
  label: {
    fontSize: string;
  }
  padding: string;
}
```

Cartesian charts

| Name                      | Type                                    | Description                                                     |
| ------------------------- | --------------------------------------- | --------------------------------------------------------------- |
| `goalLine`                | { `label`: { `fontSize`: `string`; }; } | -                                                               |
| `goalLine.label`          | { `fontSize`: `string`; }               | -                                                               |
| `goalLine.label.fontSize` | `string`                                | Font size of goal line labels                                   |
| `label`                   | { `fontSize`: `string`; }               | -                                                               |
| `label.fontSize`          | `string`                                | Labels used in cartesian charts, such as axis ticks and series. |
| `padding?`                | `string`                                | Padding around the chart.                                       |

***

##### collectionBrowser

```ts
collectionBrowser: {
  breadcrumbs: {
    expandButton: {
      backgroundColor: ColorCssVariableOrString;
      hoverBackgroundColor: ColorCssVariableOrString;
      hoverTextColor: ColorCssVariableOrString;
      textColor: ColorCssVariableOrString;
    }
  }
  emptyContent: {
    icon: {
      height: CSSProperties["width"];
      width: CSSProperties["width"];
    }
    subtitle: {
      fontSize: CSSProperties["fontSize"];
    }
    title: {
      fontSize: CSSProperties["fontSize"];
    }
  }
}
```

| Name                                            | Type                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `breadcrumbs`                                   | { `expandButton`: { `backgroundColor`: [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md); `hoverBackgroundColor`: [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md); `hoverTextColor`: [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md); `textColor`: [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md); }; } |
| `breadcrumbs.expandButton`                      | { `backgroundColor`: [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md); `hoverBackgroundColor`: [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md); `hoverTextColor`: [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md); `textColor`: [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md); }                      |
| `breadcrumbs.expandButton.backgroundColor`      | [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md)                                                                                                                                                                                                                                                                                                                 |
| `breadcrumbs.expandButton.hoverBackgroundColor` | [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md)                                                                                                                                                                                                                                                                                                                 |
| `breadcrumbs.expandButton.hoverTextColor`       | [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md)                                                                                                                                                                                                                                                                                                                 |
| `breadcrumbs.expandButton.textColor`            | [`ColorCssVariableOrString`](internal/ColorCssVariableOrString.md)                                                                                                                                                                                                                                                                                                                 |
| `emptyContent`                                  | { `icon`: { `height`: `CSSProperties`\[`"width"`]; `width`: `CSSProperties`\[`"width"`]; }; `subtitle`: { `fontSize`: `CSSProperties`\[`"fontSize"`]; }; `title`: { `fontSize`: `CSSProperties`\[`"fontSize"`]; }; }                                                                                                                                                               |
| `emptyContent.icon`                             | { `height`: `CSSProperties`\[`"width"`]; `width`: `CSSProperties`\[`"width"`]; }                                                                                                                                                                                                                                                                                                   |
| `emptyContent.icon.height`                      | `CSSProperties`\[`"width"`]                                                                                                                                                                                                                                                                                                                                                        |
| `emptyContent.icon.width`                       | `CSSProperties`\[`"width"`]                                                                                                                                                                                                                                                                                                                                                        |
| `emptyContent.subtitle`                         | { `fontSize`: `CSSProperties`\[`"fontSize"`]; }                                                                                                                                                                                                                                                                                                                                    |
| `emptyContent.subtitle.fontSize`                | `CSSProperties`\[`"fontSize"`]                                                                                                                                                                                                                                                                                                                                                     |
| `emptyContent.title`                            | { `fontSize`: `CSSProperties`\[`"fontSize"`]; }                                                                                                                                                                                                                                                                                                                                    |
| `emptyContent.title.fontSize`                   | `CSSProperties`\[`"fontSize"`]                                                                                                                                                                                                                                                                                                                                                     |

***

##### dashboard

```ts
dashboard: {
  backgroundColor: string;
  card: {
    backgroundColor: string;
    border: string;
  }
  gridBorderColor: string;
}
```

| Name                   | Type                                                 | Description                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backgroundColor`      | `string`                                             | -                                                                                                                                                                       |
| `card`                 | { `backgroundColor`: `string`; `border`: `string`; } | -                                                                                                                                                                       |
| `card.backgroundColor` | `string`                                             | -                                                                                                                                                                       |
| `card.border?`         | `string`                                             | Add custom borders to dashboard cards when set. Value is the same as the border property in CSS, such as "1px solid #ff0000". This will replace the card's drop shadow. |
| `gridBorderColor?`     | `string`                                             | Border color of the dashboard grid, shown only when editing dashboards. Defaults to `colors.border`                                                                     |

***

##### number?

```ts
optional number: {
  value: {
     fontSize: CSSProperties["fontSize"];
     lineHeight: string;
    };
};
```

Number chart

| Name                | Type                                                                    | Description                                                                               |
| ------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `value?`            | { `fontSize`: `CSSProperties`\[`"fontSize"`]; `lineHeight`: `string`; } | Value displayed on number charts. This also applies to the primary value in trend charts. |
| `value.fontSize?`   | `CSSProperties`\[`"fontSize"`]                                          | -                                                                                         |
| `value.lineHeight?` | `string`                                                                | -                                                                                         |

***

##### pivotTable

```ts
pivotTable: {
  cell: {
    fontSize: string;
  }
  rowToggle: {
    backgroundColor: string;
    textColor: string;
  }
}
```

Pivot table \*

| Name                        | Type                                                    | Description                                  |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| `cell`                      | { `fontSize`: `string`; }                               | -                                            |
| `cell.fontSize`             | `string`                                                | Font size of cell values, defaults to \~12px |
| `rowToggle`                 | { `backgroundColor`: `string`; `textColor`: `string`; } | Button to toggle pivot table rows            |
| `rowToggle.backgroundColor` | `string`                                                | -                                            |
| `rowToggle.textColor`       | `string`                                                | -                                            |

***

##### popover

```ts
popover: {
  zIndex: number;
}
```

Popover

| Name      | Type     | Description                                                                       |
| --------- | -------- | --------------------------------------------------------------------------------- |
| `zIndex?` | `number` | z-index of overlays. Useful for embedding components in a modal. Defaults to 200. |

***

##### question

```ts
question: {
  backgroundColor: string;
  toolbar: {
    backgroundColor: string;
  }
}
```

| Name                       | Type                             | Description                                        |
| -------------------------- | -------------------------------- | -------------------------------------------------- |
| `backgroundColor`          | `string`                         | Background color for all questions                 |
| `toolbar?`                 | { `backgroundColor`: `string`; } | Toolbar of the default interactive question layout |
| `toolbar.backgroundColor?` | `string`                         | -                                                  |

***

##### table

```ts
table: {
  cell: {
    backgroundColor: string;
    fontSize: string;
    textColor: string;
  }
  idColumn: {
    backgroundColor: string;
    textColor: string;
  }
  stickyBackgroundColor: string;
}
```

Data tables \*

| Name                        | Type                                                                          | Description                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `cell`                      | { `backgroundColor`: `string`; `fontSize`: `string`; `textColor`: `string`; } | -                                                                                                                             |
| `cell.backgroundColor?`     | `string`                                                                      | Default background color of cells, defaults to `background`                                                                   |
| `cell.fontSize`             | `string`                                                                      | Font size of cell values, defaults to \~12.5px                                                                                |
| `cell.textColor`            | `string`                                                                      | Text color of cells, defaults to `text-primary`.                                                                              |
| `idColumn?`                 | { `backgroundColor`: `string`; `textColor`: `string`; }                       | -                                                                                                                             |
| `idColumn.backgroundColor?` | `string`                                                                      | Background color of ID column, defaults to `lighten(brand)`                                                                   |
| `idColumn.textColor`        | `string`                                                                      | Text color of ID column, defaults to `brand`.                                                                                 |
| `stickyBackgroundColor?`    | `string`                                                                      | Background color of the table header that stays fixed while scrolling. Defaults to `white` if no cell background color is set |

***

##### tooltip?

```ts
optional tooltip: {
  backgroundColor: string;
  focusedBackgroundColor: string;
  secondaryTextColor: string;
  textColor: string;
};
```

Tooltip

| Name                      | Type     | Description                                                                                 |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `backgroundColor?`        | `string` | Tooltip background color.                                                                   |
| `focusedBackgroundColor?` | `string` | Tooltip background color for focused rows.                                                  |
| `secondaryTextColor?`     | `string` | Secondary text color shown in the tooltip, e.g. for tooltip headers and percentage changes. |
| `textColor?`              | `string` | Tooltip text color.                                                                         |
