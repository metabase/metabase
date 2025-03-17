# Type Alias: MetabaseComponentTheme

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
in DEFAULT_METABASE_COMPONENT_THEME at [default-component-theme.ts]

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="cartesian"></a> `cartesian` | \{ `goalLine`: \{ `label`: \{ `fontSize`: `string`; \}; \}; `label`: \{ `fontSize`: `string`; \}; `padding`: `string`; \} | Cartesian charts |
| `cartesian.goalLine` | \{ `label`: \{ `fontSize`: `string`; \}; \} | - |
| `cartesian.goalLine.label` | \{ `fontSize`: `string`; \} | - |
| `cartesian.goalLine.label.fontSize` | `string` | Font size of goal line labels |
| `cartesian.label` | \{ `fontSize`: `string`; \} | - |
| `cartesian.label.fontSize` | `string` | Labels used in cartesian charts, such as axis ticks and series. |
| `cartesian.padding?` | `string` | Padding around the chart. |
| <a id="collectionbrowser"></a> `collectionBrowser` | \{ `breadcrumbs`: \{ `expandButton`: \{ `backgroundColor`: `ColorCssVariableOrString`; `hoverBackgroundColor`: `ColorCssVariableOrString`; `hoverTextColor`: `ColorCssVariableOrString`; `textColor`: `ColorCssVariableOrString`; \}; \}; `emptyContent`: \{ `icon`: \{ `height`: `CSSProperties`\[`"width"`\]; `width`: `CSSProperties`\[`"width"`\]; \}; `subtitle`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \}; `title`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \}; \}; \} | - |
| `collectionBrowser.breadcrumbs` | \{ `expandButton`: \{ `backgroundColor`: `ColorCssVariableOrString`; `hoverBackgroundColor`: `ColorCssVariableOrString`; `hoverTextColor`: `ColorCssVariableOrString`; `textColor`: `ColorCssVariableOrString`; \}; \} | - |
| `collectionBrowser.breadcrumbs.expandButton` | \{ `backgroundColor`: `ColorCssVariableOrString`; `hoverBackgroundColor`: `ColorCssVariableOrString`; `hoverTextColor`: `ColorCssVariableOrString`; `textColor`: `ColorCssVariableOrString`; \} | - |
| `collectionBrowser.breadcrumbs.expandButton.backgroundColor` | `ColorCssVariableOrString` | - |
| `collectionBrowser.breadcrumbs.expandButton.hoverBackgroundColor` | `ColorCssVariableOrString` | - |
| `collectionBrowser.breadcrumbs.expandButton.hoverTextColor` | `ColorCssVariableOrString` | - |
| `collectionBrowser.breadcrumbs.expandButton.textColor` | `ColorCssVariableOrString` | - |
| `collectionBrowser.emptyContent` | \{ `icon`: \{ `height`: `CSSProperties`\[`"width"`\]; `width`: `CSSProperties`\[`"width"`\]; \}; `subtitle`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \}; `title`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \}; \} | - |
| `collectionBrowser.emptyContent.icon` | \{ `height`: `CSSProperties`\[`"width"`\]; `width`: `CSSProperties`\[`"width"`\]; \} | - |
| `collectionBrowser.emptyContent.icon.height` | `CSSProperties`\[`"width"`\] | - |
| `collectionBrowser.emptyContent.icon.width` | `CSSProperties`\[`"width"`\] | - |
| `collectionBrowser.emptyContent.subtitle` | \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \} | - |
| `collectionBrowser.emptyContent.subtitle.fontSize` | `CSSProperties`\[`"fontSize"`\] | - |
| `collectionBrowser.emptyContent.title` | \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; \} | - |
| `collectionBrowser.emptyContent.title.fontSize` | `CSSProperties`\[`"fontSize"`\] | - |
| <a id="dashboard"></a> `dashboard` | \{ `backgroundColor`: `string`; `card`: \{ `backgroundColor`: `string`; `border`: `string`; \}; `gridBorderColor`: `string`; \} | - |
| `dashboard.backgroundColor` | `string` | - |
| `dashboard.card` | \{ `backgroundColor`: `string`; `border`: `string`; \} | - |
| `dashboard.card.backgroundColor` | `string` | - |
| `dashboard.card.border?` | `string` | Add custom borders to dashboard cards when set. Value is the same as the border property in CSS, such as "1px solid #ff0000". This will replace the card's drop shadow. |
| `dashboard.gridBorderColor?` | `string` | Border color of the dashboard grid, shown only when editing dashboards. Defaults to `colors.border` |
| <a id="number"></a> `number?` | \{ `value`: \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; `lineHeight`: `string`; \}; \} | Number chart |
| `number.value?` | \{ `fontSize`: `CSSProperties`\[`"fontSize"`\]; `lineHeight`: `string`; \} | Value displayed on number charts. This also applies to the primary value in trend charts. |
| `number.value.fontSize?` | `CSSProperties`\[`"fontSize"`\] | - |
| `number.value.lineHeight?` | `string` | - |
| <a id="pivottable"></a> `pivotTable` | \{ `cell`: \{ `fontSize`: `string`; \}; `rowToggle`: \{ `backgroundColor`: `string`; `textColor`: `string`; \}; \} | Pivot table * |
| `pivotTable.cell` | \{ `fontSize`: `string`; \} | - |
| `pivotTable.cell.fontSize` | `string` | Font size of cell values, defaults to ~12px |
| `pivotTable.rowToggle` | \{ `backgroundColor`: `string`; `textColor`: `string`; \} | Button to toggle pivot table rows |
| `pivotTable.rowToggle.backgroundColor` | `string` | - |
| `pivotTable.rowToggle.textColor` | `string` | - |
| <a id="popover"></a> `popover` | \{ `zIndex`: `number`; \} | Popover |
| `popover.zIndex?` | `number` | z-index of overlays. Useful for embedding components in a modal. Defaults to 200. |
| <a id="question"></a> `question` | \{ `backgroundColor`: `string`; `toolbar`: \{ `backgroundColor`: `string`; \}; \} | - |
| `question.backgroundColor` | `string` | Background color for all questions |
| `question.toolbar?` | \{ `backgroundColor`: `string`; \} | Toolbar of the default interactive question layout |
| `question.toolbar.backgroundColor?` | `string` | - |
| <a id="table"></a> `table` | \{ `cell`: \{ `backgroundColor`: `string`; `fontSize`: `string`; `textColor`: `string`; \}; `idColumn`: \{ `backgroundColor`: `string`; `textColor`: `string`; \}; \} | Data tables * |
| `table.cell` | \{ `backgroundColor`: `string`; `fontSize`: `string`; `textColor`: `string`; \} | - |
| `table.cell.backgroundColor?` | `string` | Default background color of cells, defaults to `background` |
| `table.cell.fontSize` | `string` | Font size of cell values, defaults to ~12.5px |
| `table.cell.textColor` | `string` | Text color of cells, defaults to `text-primary`. |
| `table.idColumn?` | \{ `backgroundColor`: `string`; `textColor`: `string`; \} | - |
| `table.idColumn.backgroundColor?` | `string` | Background color of ID column, defaults to `lighten(brand)` |
| `table.idColumn.textColor` | `string` | Text color of ID column, defaults to `brand`. |
| <a id="tooltip"></a> `tooltip?` | \{ `backgroundColor`: `string`; `focusedBackgroundColor`: `string`; `secondaryTextColor`: `string`; `textColor`: `string`; \} | Tooltip |
| `tooltip.backgroundColor?` | `string` | Tooltip background color. |
| `tooltip.focusedBackgroundColor?` | `string` | Tooltip background color for focused rows. |
| `tooltip.secondaryTextColor?` | `string` | Secondary text color shown in the tooltip, e.g. for tooltip headers and percentage changes. |
| `tooltip.textColor?` | `string` | Tooltip text color. |
