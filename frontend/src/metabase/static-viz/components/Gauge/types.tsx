import type { ComponentProps } from "react";

import type OutlinedText from "metabase/static-viz/components/Text/OutlinedText";
import type { GoalSegment } from "metabase-types/api";

export type Position = [x: number, y: number];

interface GaugeVisualizationSettings {
  "gauge.segments"?: GoalSegment[];
  column_settings?: {
    [key: string]: Record<string, string | number>;
  };
}

export interface Card {
  visualization_settings: GaugeVisualizationSettings;
}

export type TextAnchor = ComponentProps<typeof OutlinedText>["textAnchor"];

export interface GaugeLabelData {
  position: Position;
  textAnchor: TextAnchor;
  value: string;
  color: string;
}
