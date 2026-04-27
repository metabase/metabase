import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";

import type { StatsFilters } from "./query-utils";

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
    onDimensionClick?: (value: unknown) => void;
    h?: number;
  };

export type ChartInnerProps = StatsFilters &
  ChartDataSources & {
    onDimensionClick?: (value: unknown) => void;
    h: number;
  };
