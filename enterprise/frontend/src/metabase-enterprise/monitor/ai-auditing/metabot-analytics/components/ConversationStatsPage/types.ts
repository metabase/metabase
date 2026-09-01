import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";

import type { StatsFilters } from "./query-utils";

export const DEFAULT_CHART_HEIGHT = 350;

export type DimensionClickHandler = (value: string) => void;

export type ChartDataSources = {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
};

export type NullableChartDataSources = {
  [K in keyof ChartDataSources]: ChartDataSources[K] | null;
};

export type ChartProps = StatsFilters &
  NullableChartDataSources & {
    onDimensionClick?: DimensionClickHandler;
    h?: number;
  };

export type ChartInnerProps = StatsFilters &
  ChartDataSources & {
    onDimensionClick?: DimensionClickHandler;
    h: number;
  };
