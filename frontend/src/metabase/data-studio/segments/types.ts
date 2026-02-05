import type { ReactNode } from "react";
import type { Route } from "react-router";

import type { Segment, Table } from "metabase-types/api";

export type SegmentTabUrls = {
  definition: string;
  revisions: string;
  dependencies: string;
};

export type NewSegmentPageProps = {
  route: Route;
  table: Table;
  breadcrumbs: ReactNode;
  getSuccessUrl: (segment: Segment) => string;
};

export type ExistingSegmentPageProps = {
  segment: Segment;
  tabUrls: SegmentTabUrls;
  breadcrumbs: ReactNode;
  onRemove: () => Promise<void>;
};

export type SegmentDetailPageProps = ExistingSegmentPageProps & {
  route: Route;
};

export type SegmentRevisionHistoryPageProps = ExistingSegmentPageProps;

export type SegmentDependenciesPageProps = ExistingSegmentPageProps & {
  children?: ReactNode;
};
