```ts
type MetabaseCard = MetabaseCardBase &
  | {
  visualization?: never;
  visualizationSettings?: never;
}
  | {
  visualization: "table" | "pivot" | "object" | "list";
  visualizationSettings?: TableVisualizationSettings;
}
  | {
  visualization: "bar" | "line" | "area" | "combo" | "row";
  visualizationSettings?: CartesianVisualizationSettings;
}
  | {
  visualization: "scatter";
  visualizationSettings?: ScatterVisualizationSettings;
}
  | {
  visualization: "waterfall";
  visualizationSettings?: WaterfallVisualizationSettings;
}
  | {
  visualization: "pie";
  visualizationSettings?: PieVisualizationSettings;
}
  | {
  visualization: "scalar" | "smartscalar" | "gauge" | "progress";
  visualizationSettings?: ScalarVisualizationSettings;
}
  | {
  visualization: "funnel";
  visualizationSettings?: FunnelVisualizationSettings;
}
  | {
  visualization: "map";
  visualizationSettings?: MapVisualizationSettings;
}
  | {
  visualization: "sankey";
  visualizationSettings?: SankeyVisualizationSettings;
}
  | {
  visualization: "boxplot";
  visualizationSettings?: BoxplotVisualizationSettings;
}
  | {
  visualization: CustomVizDisplayType;
  visualizationSettings?: Record<string, unknown>;
};
```

Ad-hoc card definition for SDK-rendered questions. Pass only `query` when
Metabase should infer a display from the query result. Add `visualization`
when the user or design asks for a specific chart type. Add
`visualizationSettings` only for explicit setting-level presentation changes.

## Not Exported

<!-- [<snippet not-exported>] -->

MetabaseCardBase

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

TableVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

CartesianVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

ScatterVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

WaterfallVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

PieVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

ScalarVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

FunnelVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

MapVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

SankeyVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

BoxplotVisualizationSettings

<!-- [<endsnippet not-exported>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

CustomVizDisplayType

<!-- [<endsnippet not-exported>] -->
