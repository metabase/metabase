export type RowSizingState = Map<number, number>;

export type UseRowHeightsResult = {
  rowMeasureRef: (element: HTMLDivElement | null) => void;
  getRowHeight: (rowIndex: number) => number;
  rowSizingMap: RowSizingState;
  remeasureAll: () => void;
};

export type HeightChangeEvent = {
  index: number;
  height: number;
  elements: Set<Element> | undefined;
};
