export type ObjectId = number | string;

export type OnVisualizationClickType =
  | (({
      column,
      value,
      element,
    }: {
      column?: any;
      value?: any;
      element: Element;
    }) => void)
  | undefined;
