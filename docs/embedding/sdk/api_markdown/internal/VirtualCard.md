```ts
type VirtualCard = Partial<Omit<Card, "name" | "dataset_query" | "visualization_settings" | "display">> & {
  dataset_query: Record<string, never>;
  display: VirtualCardDisplay;
  name: null;
  visualization_settings: VisualizationSettings;
};
```

#### Type declaration

| Name                     | Type                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `dataset_query`          | `Record`<`string`, `never`>                                    |
| `display`                | [`VirtualCardDisplay`](./api_html/VirtualCardDisplay.md)       |
| `name`                   | `null`                                                         |
| `visualization_settings` | [`VisualizationSettings`](./api_html/VisualizationSettings.md) |
