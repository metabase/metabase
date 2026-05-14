import type { CollectionId, UserId } from "metabase-types/api";

export type SlideId = string;

export type SlideLayout =
  | "cover"
  | "bullets"
  | "chart_hero"
  | "metrics_grid"
  | "title_metrics_with_chart"
  | "two_column"
  | "big_quote"
  | "closing";

export interface MetricCell {
  value: string;
  label: string;
  subtext?: string | null;
  card_id?: number | null;
}

export type CoverData = {
  title: string;
  subtitle?: string | null;
  accent?: "violet" | "sunset" | "ocean" | "forest";
};

export type BulletsData = {
  title: string;
  bullets: string[];
  eyebrow?: string | null;
};

export type ChartHeroData = {
  title: string;
  card_id: number;
  caption?: string | null;
};

export type MetricsGridData = {
  title: string;
  metrics: MetricCell[];
};

export type TitleMetricsWithChartData = {
  title: string;
  description?: string | null;
  card_id: number;
  metrics: MetricCell[];
};

export type TwoColumnData = {
  title: string;
  bullets: string[];
  card_id: number;
};

export type BigQuoteData = {
  quote: string;
  attribution?: string | null;
};

export type ClosingData = {
  title: string;
  subtitle?: string | null;
};

export type SlideDataByLayout = {
  cover: CoverData;
  bullets: BulletsData;
  chart_hero: ChartHeroData;
  metrics_grid: MetricsGridData;
  title_metrics_with_chart: TitleMetricsWithChartData;
  two_column: TwoColumnData;
  big_quote: BigQuoteData;
  closing: ClosingData;
};

export type Slide = {
  [L in SlideLayout]: {
    id: SlideId;
    layout: L;
    data: SlideDataByLayout[L];
  };
}[SlideLayout];

export interface SlidesDeck {
  id: number;
  entity_id: string;
  name: string;
  slides: Slide[];
  creator_id: UserId;
  collection_id: CollectionId | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSlidesRequest {
  name: string;
  slides?: Slide[];
  collection_id?: CollectionId | null;
}

export interface UpdateSlidesRequest {
  id: number;
  name?: string;
  slides?: Slide[];
  collection_id?: CollectionId | null;
  archived?: boolean;
}
