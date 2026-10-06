import { useListDuplicatedFindingsQuery } from "metabase-enterprise/api";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";

import {
  type DuplicatedContentParams,
  duplicatedContentConfig,
} from "../config";

import { ContentDiagnosticsContent } from "./ContentDiagnosticsContent";
import { DuplicatedContentFilterBar } from "./DuplicatedContentFilterBar";
import { DuplicatedContentSidebar } from "./DuplicatedContentSidebar";
import { DuplicatedContentTable } from "./DuplicatedContentTable";
import type { ContentDiagnosticsParamsOptions } from "./types";

type DuplicatedContentProps = {
  params: DuplicatedContentParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: DuplicatedContentParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
};

export function DuplicatedContent({
  params,
  isLoadingParams,
  onParamsChange,
}: DuplicatedContentProps) {
  const config = duplicatedContentConfig;
  const { page = 0, query } = params;
  const filterOptions = config.getFilterOptions(params);
  const { data, currentData, isFetching, isLoading, error } =
    useListDuplicatedFindingsQuery(
      {
        query,
        "entity-types": config.getEntityTypesParam(filterOptions.entityTypes),
        "include-personal-collections":
          filterOptions.includePersonalCollections,
        "min-duplicate-count": filterOptions.minDuplicateCount,
        "sort-column": params.sortColumn,
        "sort-direction": params.sortDirection,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      },
      { skip: isLoadingParams },
    );

  return (
    <ContentDiagnosticsContent
      tab={"duplicated"}
      config={config}
      params={params}
      filterOptions={filterOptions}
      isLoadingParams={isLoadingParams}
      onParamsChange={onParamsChange}
      data={data}
      isFetchingFindings={isFetching}
      hasCurrentData={currentData !== undefined}
      isLoadingFindings={isLoading}
      error={error}
      renderFilterBar={(props) => <DuplicatedContentFilterBar {...props} />}
      renderTable={(props) => <DuplicatedContentTable {...props} />}
      renderSidebar={(finding, onClose) => (
        <DuplicatedContentSidebar finding={finding} onClose={onClose} />
      )}
    />
  );
}
