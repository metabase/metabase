import { useListImbalancedFindingsQuery } from "metabase-enterprise/api";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";
import type { ContentDiagnosticsImbalancedFindingType } from "metabase-types/api";

import {
  type ImbalancedContentParams,
  getImbalancedContentConfig,
} from "../config";

import { ContentDiagnosticsContent } from "./ContentDiagnosticsContent";
import { ImbalancedContentFilterBar } from "./ImbalancedContentFilterBar";
import { ImbalancedContentSidebar } from "./ImbalancedContentSidebar";
import { ImbalancedContentTable } from "./ImbalancedContentTable";
import { getImbalancedEmptyStateLabel } from "./imbalanced-utils";
import type { ContentDiagnosticsParamsOptions } from "./types";

type ImbalancedContentProps = {
  mode: ContentDiagnosticsImbalancedFindingType;
  params: ImbalancedContentParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: ImbalancedContentParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
};

export function ImbalancedContent({
  mode,
  params,
  isLoadingParams,
  onParamsChange,
}: ImbalancedContentProps) {
  const config = getImbalancedContentConfig(mode);
  const { page = 0, query } = params;
  const filterOptions = config.getFilterOptions(params);
  const { data, currentData, isFetching, isLoading, error } =
    useListImbalancedFindingsQuery(
      {
        query,
        "entity-types": config.getEntityTypesParam(filterOptions.entityTypes),
        "include-personal-collections":
          filterOptions.includePersonalCollections,
        "finding-types": [mode],
        "sort-column": params.sortColumn,
        "sort-direction": params.sortDirection,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      },
      { skip: isLoadingParams },
    );

  return (
    <ContentDiagnosticsContent
      tab={mode}
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
      enableBulkTrash={mode !== "crowded"}
      renderFilterBar={(props) => (
        <ImbalancedContentFilterBar {...props} mode={mode} />
      )}
      renderTable={(props) => (
        <ImbalancedContentTable
          {...props}
          mode={mode}
          emptyStateLabel={getImbalancedEmptyStateLabel(mode)}
        />
      )}
      renderSidebar={(finding, onClose) => (
        <ImbalancedContentSidebar
          finding={finding}
          tab={mode}
          onClose={onClose}
        />
      )}
    />
  );
}
