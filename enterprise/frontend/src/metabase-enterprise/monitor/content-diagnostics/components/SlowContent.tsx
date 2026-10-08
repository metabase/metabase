import { useListSlowFindingsQuery } from "metabase-enterprise/api";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";

import { type SlowContentParams, slowContentConfig } from "../config";

import { ContentDiagnosticsContent } from "./ContentDiagnosticsContent";
import { SlowContentFilterBar } from "./SlowContentFilterBar";
import { SlowContentSidebar } from "./SlowContentSidebar";
import { SlowContentTable } from "./SlowContentTable";
import type { ContentDiagnosticsParamsOptions } from "./types";

type SlowContentProps = {
  params: SlowContentParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: SlowContentParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
};

export function SlowContent({
  params,
  isLoadingParams,
  onParamsChange,
}: SlowContentProps) {
  const config = slowContentConfig;
  const { page = 0, query } = params;
  const filterOptions = config.getFilterOptions(params);
  const { data, isFetching, isLoading, error } = useListSlowFindingsQuery(
    {
      query,
      "entity-types": config.getEntityTypesParam(filterOptions.entityTypes),
      "include-personal-collections": filterOptions.includePersonalCollections,
      "min-duration-ms": filterOptions.minDurationMs,
      "sort-column": params.sortColumn,
      "sort-direction": params.sortDirection,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { skip: isLoadingParams },
  );

  return (
    <ContentDiagnosticsContent
      tab={"slow"}
      config={config}
      params={params}
      filterOptions={filterOptions}
      isLoadingParams={isLoadingParams}
      onParamsChange={onParamsChange}
      data={data}
      isFetchingFindings={isFetching}
      isLoadingFindings={isLoading}
      error={error}
      renderFilterBar={(props) => <SlowContentFilterBar {...props} />}
      renderTable={(props) => <SlowContentTable {...props} />}
      renderSidebar={(finding, onClose) => (
        <SlowContentSidebar finding={finding} onClose={onClose} />
      )}
    />
  );
}
