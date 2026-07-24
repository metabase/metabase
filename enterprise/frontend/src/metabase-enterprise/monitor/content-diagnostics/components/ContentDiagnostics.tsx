import { useElementSize } from "@mantine/hooks";
import { useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Button, Center, Flex, Icon } from "metabase/ui";
import type * as Urls from "metabase/urls";
import {
  useListStaleFindingsQuery,
  useRunContentDiagnosticsScanMutation,
} from "metabase-enterprise/api";

import { ContentDiagnosticsSidebar } from "./ContentDiagnosticsSidebar";
import { ContentDiagnosticsTable } from "./ContentDiagnosticsTable";
import { DiagnosticsFilterBar } from "./DiagnosticsFilterBar";
import { DiagnosticsHeader } from "./DiagnosticsHeader";
import { DiagnosticsPagination } from "./DiagnosticsPagination";
import { PAGE_SIZE } from "./constants";
import type {
  ContentDiagnosticsFilterOptions,
  ContentDiagnosticsParamsOptions,
} from "./types";
import {
  getEntityTypesParam,
  getFilterOptions,
  getFilterParams,
} from "./utils";

type ContentDiagnosticsProps = {
  params: Urls.ContentDiagnosticsParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: Urls.ContentDiagnosticsParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
};

export function ContentDiagnostics({
  params,
  isLoadingParams,
  onParamsChange,
}: ContentDiagnosticsProps) {
  const dispatch = useDispatch();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [selectedFindingId, setSelectedFindingId] = useState<number>();

  const { page = 0, query } = params;
  const filterOptions = getFilterOptions(params);

  const {
    data,
    isFetching: isFetchingFindings,
    isLoading: isLoadingFindings,
    error,
  } = useListStaleFindingsQuery(
    {
      query,
      "entity-types": getEntityTypesParam(filterOptions.entityTypes),
      "include-personal-collections": filterOptions.includePersonalCollections,
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

  // Dev/testing trigger: the production scan runs on a schedule (Quartz job).
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
    newFilterOptions: ContentDiagnosticsFilterOptions,
  ) => {
    onParamsChange(
      {
        ...params,
        ...getFilterParams(newFilterOptions),
        page: undefined,
      },
      { withSetLastUsedParams: true },
    );
  };

  const handlePageChange = (page: number) => {
    onParamsChange({ ...params, page });
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
        <DiagnosticsFilterBar
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
          <ContentDiagnosticsTable
            findings={findings}
            isLoading={isLoading}
            onSelect={(finding) => setSelectedFindingId(finding.id)}
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
          <ContentDiagnosticsSidebar
            finding={selectedFinding}
            onClose={() => setSelectedFindingId(undefined)}
          />
        </Sidebar>
      )}
    </Flex>
  );
}
