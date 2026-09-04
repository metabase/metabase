import type { ReactNode } from "react";

import type { Measure, Table } from "metabase-types/api";

export type MeasureTabUrls = {
  definition: string;
  revisions: string;
  dependencies: string;
};

export type NewMeasurePageProps = {
  table: Table;
  breadcrumbs: ReactNode;
  getSuccessUrl: (measure: Measure) => string;
};

export type ExistingMeasurePageProps = {
  measure: Measure;
  tabUrls: MeasureTabUrls;
  breadcrumbs: ReactNode;
  onRemove: () => Promise<void>;
};

export type MeasureDetailPageProps = ExistingMeasurePageProps;

export type MeasureRevisionHistoryPageProps = ExistingMeasurePageProps;

export type MeasureDependenciesPageProps = ExistingMeasurePageProps & {
  children?: ReactNode;
};
