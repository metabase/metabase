import type { ComponentProps } from "react";

import type OutlinedText from "metabase/static-viz/components/Text/OutlinedText";

export type Position = [x: number, y: number];

export interface GaugeSegment {
  min: number;
  max: number;
  color: string;
  label: string;
}

interface GaugeVisualizationSettings {
  "gauge.segments": GaugeSegment[];
  column_settings?: {
    [key: string]: Record<string, string | number>;
  };
}

export interface Card {
  visualization_settings: GaugeVisualizationSettings;
}

type GaugeData = [number];

export interface Data {
  rows: [GaugeData];
}

export type TextAnchor = ComponentProps<typeof OutlinedText>["textAnchor"];

export interface GaugeLabelData {
  position: Position;
  textAnchor: TextAnchor;
  value: string;
  color: string;
}
