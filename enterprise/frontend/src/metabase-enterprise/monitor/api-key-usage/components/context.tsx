import { type ReactNode, createContext, useContext } from "react";

import type {
  ApiKeyUsageEventSortColumn,
  ApiKeyUsageFilters,
} from "metabase-enterprise/monitor/api-key-usage/query-utils";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { SortingOptions } from "metabase-types/api";

type ApiKeyUsageDataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

export type ApiKeyUsageContextValue = {
  dataSources: ApiKeyUsageDataSources;
  chartFilters: ApiKeyUsageFilters;
  hasTenants: boolean;
  hasPii: boolean;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  sortingOptions: SortingOptions<ApiKeyUsageEventSortColumn>;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<ApiKeyUsageEventSortColumn>,
  ) => void;
};

const ApiKeyUsageContext = createContext<ApiKeyUsageContextValue | null>(null);

type ApiKeyUsageContextProviderProps = {
  children: ReactNode;
  value: ApiKeyUsageContextValue;
};

export function ApiKeyUsageContextProvider({
  children,
  value,
}: ApiKeyUsageContextProviderProps) {
  return (
    <ApiKeyUsageContext.Provider value={value}>
      {children}
    </ApiKeyUsageContext.Provider>
  );
}

export function useApiKeyUsageContext(): ApiKeyUsageContextValue {
  const context = useContext(ApiKeyUsageContext);
  if (context === null) {
    throw new Error(
      "useApiKeyUsageContext must be used within ApiKeyUsageContextProvider",
    );
  }
  return context;
}
