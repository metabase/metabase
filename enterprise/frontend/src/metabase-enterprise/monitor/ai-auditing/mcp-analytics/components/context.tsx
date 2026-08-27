import { type ReactNode, createContext, useContext } from "react";

import type {
  McpEventSortColumn,
  McpFilters,
} from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/query-utils";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { SortingOptions } from "metabase-types/api";

type McpDataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

export type McpAnalyticsContextValue = {
  dataSources: McpDataSources;
  chartFilters: McpFilters;
  hasTenants: boolean;
  hasPii: boolean;
  hasErrors: boolean;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  sortingOptions: SortingOptions<McpEventSortColumn>;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<McpEventSortColumn>,
  ) => void;
};

const McpAnalyticsContext = createContext<McpAnalyticsContextValue | null>(
  null,
);

type McpAnalyticsContextProviderProps = {
  children: ReactNode;
  value: McpAnalyticsContextValue;
};

export function McpAnalyticsContextProvider({
  children,
  value,
}: McpAnalyticsContextProviderProps) {
  return (
    <McpAnalyticsContext.Provider value={value}>
      {children}
    </McpAnalyticsContext.Provider>
  );
}

export function useMcpAnalyticsContext(): McpAnalyticsContextValue {
  const context = useContext(McpAnalyticsContext);
  if (context === null) {
    throw new Error(
      "useMcpAnalyticsContext must be used within McpAnalyticsContextProvider",
    );
  }
  return context;
}
