import type { ReactNode } from "react";

export type WidgetId = string;

type CommonWidgetProps = {
  id: WidgetId;
  childrenIds?: WidgetId[];
};

export type DataAppWidgetSection = CommonWidgetProps & {
  type: "section";
  childrenIds: WidgetId[];
  options: {
    direction: "row" | "column";
    width: number; // 1 - 3
  };
};

export type DataAppWidgetButton = CommonWidgetProps & {
  type: "button";
  options: {
    text: string;
  };
};

export type DataAppWidgetText = CommonWidgetProps & {
  type: "text";
  options: {
    text: string;
  };
};

export type DataAppWidget =
  | DataAppWidgetSection
  | DataAppWidgetButton
  | DataAppWidgetText;

export type DataAppWidgetType = DataAppWidget["type"];

export type RenderCanvasComponentFn = (
  id: WidgetId,
  handleDrop: (params: HandleDropFnArguments) => void,
) => ReactNode | null;

export type CanvasComponentsMap = Map<WidgetId, DataAppWidget>;

export type HandleDropFnArguments = {
  item: DataAppWidget & { fromSidebar?: boolean };
  over: DataAppWidget;
  index: number;
};

export type CanvasComponentCommonProps = {
  widget: DataAppWidget;
  renderCanvasComponent: RenderCanvasComponentFn;
  handleDrop: (params: HandleDropFnArguments) => void;
};

export type CanvasComponentRenderer = (
  props: CanvasComponentCommonProps,
) => ReactNode | null;
