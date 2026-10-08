import { useListStaleFindingsQuery } from "metabase-enterprise/api";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";

import { type StaleContentParams, staleContentConfig } from "../config";

import { ContentDiagnosticsContent } from "./ContentDiagnosticsContent";
import { StaleContentFilterBar } from "./StaleContentFilterBar";
import { StaleContentSidebar } from "./StaleContentSidebar";
import { StaleContentTable } from "./StaleContentTable";
import type { ContentDiagnosticsParamsOptions } from "./types";

type StaleContentProps = {
  params: StaleContentParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: StaleContentParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
};

export function StaleContent({
  params,
  isLoadingParams,
  onParamsChange,
}: StaleContentProps) {
  const config = staleContentConfig;
  const { page = 0, query } = params;
  const filterOptions = config.getFilterOptions(params);
  const { data, isFetching, isLoading, error } = useListStaleFindingsQuery(
    {
      query,
      "entity-types": config.getEntityTypesParam(filterOptions.entityTypes),
      "include-personal-collections": filterOptions.includePersonalCollections,
      "threshold-days": filterOptions.thresholdDays,
      "sort-column": params.sortColumn,
      "sort-direction": params.sortDirection,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { skip: isLoadingParams },
  );

  return (
    <ContentDiagnosticsContent
      tab={"stale"}
      config={config}
      params={params}
      filterOptions={filterOptions}
      isLoadingParams={isLoadingParams}
      onParamsChange={onParamsChange}
      data={data}
      isFetchingFindings={isFetching}
      isLoadingFindings={isLoading}
      error={error}
      renderFilterBar={(props) => <StaleContentFilterBar {...props} />}
      renderTable={(props) => <StaleContentTable {...props} />}
      renderSidebar={(finding, onClose) => (
        <StaleContentSidebar finding={finding} onClose={onClose} />
      )}
    />
  );
}
