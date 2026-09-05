import { type ReactNode, createContext, useContext } from "react";

import type {
  CliEventSortColumn,
  CliFilters,
} from "metabase-enterprise/monitor/ai-auditing/cli-analytics/query-utils";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { SortingOptions } from "metabase-types/api";

type CliDataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

export type CliAnalyticsContextValue = {
  dataSources: CliDataSources;
  chartFilters: CliFilters;
  hasTenants: boolean;
  hasPii: boolean;
  hasErrors: boolean;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  sortingOptions: SortingOptions<CliEventSortColumn>;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<CliEventSortColumn>,
  ) => void;
};

const CliAnalyticsContext = createContext<CliAnalyticsContextValue | null>(
  null,
);

type CliAnalyticsContextProviderProps = {
  children: ReactNode;
  value: CliAnalyticsContextValue;
};

export function CliAnalyticsContextProvider({
  children,
  value,
}: CliAnalyticsContextProviderProps) {
  return (
    <CliAnalyticsContext.Provider value={value}>
      {children}
    </CliAnalyticsContext.Provider>
  );
}

export function useCliAnalyticsContext(): CliAnalyticsContextValue {
  const context = useContext(CliAnalyticsContext);
  if (context === null) {
    throw new Error(
      "useCliAnalyticsContext must be used within CliAnalyticsContextProvider",
    );
  }
  return context;
}
