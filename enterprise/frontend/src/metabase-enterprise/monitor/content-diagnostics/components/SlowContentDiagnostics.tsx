import { useElementSize } from "@mantine/hooks";
import { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Button, Center, Flex, Icon } from "metabase/ui";
import type * as Urls from "metabase/urls";
import type { Sorting } from "metabase/utils/sorting";
import {
  useListSlowFindingsQuery,
  useRunContentDiagnosticsScanMutation,
} from "metabase-enterprise/api";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";
import type { ContentDiagnosticsSlowSortColumn } from "metabase-types/api";

import { DiagnosticsHeader } from "./DiagnosticsHeader";
import { DiagnosticsPagination } from "./DiagnosticsPagination";
import { SlowContentDiagnosticsSidebar } from "./SlowContentDiagnosticsSidebar";
import { SlowContentDiagnosticsTable } from "./SlowContentDiagnosticsTable";
import { SlowDiagnosticsFilterBar } from "./SlowDiagnosticsFilterBar";
import {
  getSlowEntityTypesParam,
  getSlowFilterOptions,
  getSlowFilterParams,
  getSlowSortOptions,
} from "./slow-utils";
import type {
  ContentDiagnosticsParamsOptions,
  SlowContentFilterOptions,
} from "./types";

type SlowContentDiagnosticsProps = {
  params: Urls.SlowContentParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: Urls.SlowContentParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
};

export function SlowContentDiagnostics({
  params,
  isLoadingParams,
  onParamsChange,
}: SlowContentDiagnosticsProps) {
  const dispatch = useDispatch();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [selectedFindingId, setSelectedFindingId] = useState<number>();

  const { page = 0, query } = params;
  const filterOptions = useMemo(() => getSlowFilterOptions(params), [params]);
  const sortOptions = useMemo(() => getSlowSortOptions(params), [params]);

  const {
    data,
    isFetching: isFetchingFindings,
    isLoading: isLoadingFindings,
    error,
  } = useListSlowFindingsQuery(
    {
      query,
      "entity-types": getSlowEntityTypesParam(filterOptions.entityTypes),
      "include-personal-collections": filterOptions.includePersonalCollections,
      "min-duration-ms": filterOptions.minDurationMs,
      "sort-column": params.sortColumn,
      "sort-direction": params.sortDirection,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    {
      skip: isLoadingParams,
    },
  );

  const isFetching = isFetchingFindings || isLoadingParams;
  const isLoading = isLoadingFindings || isLoadingParams;

  const [runScan, { isLoading: isScanning }] =
    useRunContentDiagnosticsScanMutation();

  const handleScan = async () => {
    try {
      const result = await runScan().unwrap();
      dispatch(
        addUndo({
          message: t`Scan complete — ${result.finding_count} findings`,
        }),
      );
    } catch {
      dispatch(addUndo({ message: t`Scan failed`, icon: "warning" }));
    }
  };

  const findings = data?.data ?? [];
  const totalCount = data?.total ?? 0;
  const selectedFinding = findings.find(
    (finding) => finding.id === selectedFindingId,
  );

  const handleQueryChange = (query: string | undefined) => {
    onParamsChange({ ...params, query, page: undefined });
  };

  const handleFilterOptionsChange = (
    newFilterOptions: SlowContentFilterOptions,
  ) => {
    onParamsChange(
      {
        ...params,
        ...getSlowFilterParams(newFilterOptions),
        page: undefined,
      },
      { withSetLastUsedParams: true },
    );
  };

  const handlePageChange = (page: number) => {
    onParamsChange({ ...params, page });
  };

  const handleSortOptionsChange = (
    sortOptions: Sorting<ContentDiagnosticsSlowSortColumn> | undefined,
  ) => {
    onParamsChange(
      {
        ...params,
        sortColumn: sortOptions?.column,
        sortDirection: sortOptions?.direction,
        page: undefined,
      },
      { withSetLastUsedParams: true },
    );
  };

  useLayoutEffect(() => {
    if (selectedFindingId != null && selectedFinding == null) {
      setSelectedFindingId(undefined);
    }
  }, [selectedFindingId, selectedFinding]);

  return (
    <Flex ref={containerRef} h="100%" wrap="nowrap">
      <MonitorMain>
        <DiagnosticsHeader />
        <SlowDiagnosticsFilterBar
          query={query}
          filterOptions={filterOptions}
          isFetching={isFetching}
          isLoading={isLoading}
          onQueryChange={handleQueryChange}
          onFilterOptionsChange={handleFilterOptionsChange}
          actions={
            <Button
              variant="default"
              leftSection={<Icon name="refresh" />}
              loading={isScanning}
              data-testid="content-diagnostics-scan-button"
              onClick={handleScan}
            >
              {t`Rescan`}
            </Button>
          }
        />
        {error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <SlowContentDiagnosticsTable
            findings={findings}
            params={params}
            sortOptions={sortOptions}
            isFetching={isFetching}
            isLoading={isLoading}
            onSelect={(finding) => setSelectedFindingId(finding.id)}
            onSortOptionsChange={handleSortOptionsChange}
          />
        )}
        {!isLoading && error == null && (
          <DiagnosticsPagination
            page={page}
            pageItemCount={findings.length}
            totalCount={totalCount}
            onPageChange={handlePageChange}
          />
        )}
      </MonitorMain>
      {selectedFinding != null && (
        <Sidebar containerWidth={containerWidth}>
          <SlowContentDiagnosticsSidebar
            finding={selectedFinding}
            onClose={() => setSelectedFindingId(undefined)}
          />
        </Sidebar>
      )}
    </Flex>
  );
}
