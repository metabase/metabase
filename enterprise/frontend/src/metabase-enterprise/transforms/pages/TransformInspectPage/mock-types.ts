import type {
  TransformSourceMock,
  TransformTargetMock,
} from "./components/InspectSummaryMock";

export interface TransformLens {
  id: string;
  "display-name": string;
  description: string;
}

export interface TransformInspectResponse {
  name: string;
  sources: TransformSourceMock[];
  target: TransformTargetMock;
  "available-lenses": TransformLens[];
}

// Lens detail types
export type LensLayout = "flat" | "comparison";

export interface LensSummaryHighlight {
  label: string;
  value: string | number | null;
  "card-id": string;
}

export interface LensSummary {
  text: string;
  alerts: string[];
  highlights: LensSummaryHighlight[];
}

export interface DrillLens {
  id: string;
  "display-name": string;
  description: string;
}

export interface LensSection {
  id: string;
  title: string;
}

export interface LensCard {
  id: string;
  "section-id": string;
  title: string;
  display: string;
  dataset_query: {
    database: number;
    type: string;
    query: Record<string, unknown>;
  };
  "visualization-settings"?: Record<string, unknown>;
  summary?: boolean;
  interestingness: number;
}

export interface TransformLensResponse {
  id: string;
  "display-name": string;
  layout: LensLayout;
  summary: LensSummary;
  "drill-lenses": DrillLens[];
  sections: LensSection[];
  cards: LensCard[];
}
