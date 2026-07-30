import type { MouseEvent } from "react";

import type { HoveredObject } from "metabase/visualizations/types";

export type LegendTitle = string | string[];

export type LegendHover = {
  index: number;
  element?: HTMLElement;
};

export interface LegendProps {
  className?: string;
  titles: LegendTitle[];
  colors: string[];
  hiddenIndices?: number[];
  hovered?: HoveredObject | null;
  onHoverChange?: (hover?: LegendHover | null) => void;
  onToggleSeriesVisibility?: (event: MouseEvent, index: number) => void;
}
