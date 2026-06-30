import { useDisclosure, useElementSize } from "@mantine/hooks";
import { useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type { PaneHeaderTab } from "metabase/common/data-studio/components/PaneHeader";
import { useMonitorSidebar } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Button, Center, Flex, Group, Icon, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useListStaleFindingsQuery,
  useRunContentDiagnosticsScanMutation,
} from "metabase-enterprise/api";
import {
  DiagnosticsFilterPicker,
  DiagnosticsHeader,
  DiagnosticsPagination,
  DiagnosticsSearchInput,
} from "metabase-enterprise/monitor/components";

import { ContentDiagnosticsSidebar } from "./ContentDiagnosticsSidebar";
import { ContentDiagnosticsTable } from "./ContentDiagnosticsTable";
import { PAGE_SIZE } from "./constants";
import type {
  ContentDiagnosticsFilterOptions,
  ContentDiagnosticsParamsOptions,
} from "./types";
import {
  areFilterOptionsEqual,
  filterFindingsByEntityTypes,
  filterFindingsByName,
  getAvailableFilterTypes,
  getDefaultFilterOptions,
  getFilterOptions,
  getFilterParams,
  getFilterTypeLabel,
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
  const { setSidebar } = useMonitorSidebar();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedFindingId, setSelectedFindingId] = useState<number>();
  const { page = 0, query } = params;
  const dispatch = useDispatch();
  const filterOptions = getFilterOptions(params);

  const {
    data,
    isFetching: isFetchingFindings,
    isLoading: isLoadingFindings,
    error,
  } = useListStaleFindingsQuery(
    {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      "include-personal-collections": filterOptions.includePersonalCollections,
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
  const hasDefaultFilterOptions = areFilterOptionsEqual(
    filterOptions,
    getDefaultFilterOptions(),
  );
  // Personal-collections filtering is applied server-side (a query param). The
  // /stale endpoint has no server-side text search or entity-type filter yet,
  // so those still narrow the current page client-side; pagination reflects the
  // full (personal-collections-filtered) server set.
  const visibleFindings = filterFindingsByEntityTypes(
    filterFindingsByName(findings, query),
    filterOptions.entityTypes,
  );
  const selectedFinding = visibleFindings.find(
    (finding) => finding.id === selectedFindingId,
  );

  const tabs: PaneHeaderTab[] = [
    {
      label: t`Stale`,
      to: Urls.staleContent(),
      icon: "clock",
    },
  ];

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

  useLayoutEffect(() => {
    if (selectedFinding == null) {
      setSidebar(null);
      return;
    }

    setSidebar(
      <ContentDiagnosticsSidebar
        finding={selectedFinding}
        containerWidth={containerWidth}
        onResizeStart={startResizing}
        onResizeStop={stopResizing}
        onClose={() => setSelectedFindingId(undefined)}
      />,
    );

    return () => setSidebar(null);
  }, [
    containerWidth,
    selectedFinding,
    setSidebar,
    startResizing,
    stopResizing,
  ]);

  return (
    <Flex
      h="100%"
      wrap="nowrap"
      style={{ userSelect: isResizing ? "none" : undefined }}
      ref={containerRef}
    >
      <Stack flex={1} gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <DiagnosticsHeader title={t`Content diagnostics`} tabs={tabs} />
          <Button
            variant="filled"
            leftSection={<Icon name="play" />}
            loading={isScanning}
            data-testid="content-diagnostics-scan-button"
            onClick={handleScan}
          >
            {t`Run scan`}
          </Button>
        </Group>
        <Group gap="md" align="center" wrap="nowrap">
          <DiagnosticsSearchInput
            query={query}
            isFetching={isFetching}
            isLoading={isLoading}
            data-testid="stale-content-search-input"
            onChange={handleQueryChange}
          />
          <DiagnosticsFilterPicker
            availableTypes={getAvailableFilterTypes()}
            selectedTypes={filterOptions.entityTypes}
            includePersonalCollections={
              filterOptions.includePersonalCollections
            }
            getTypeLabel={getFilterTypeLabel}
            isDisabled={isLoading}
            hasDefaultOptions={hasDefaultFilterOptions}
            buttonTestId="content-diagnostics-filter-button"
            onChange={({ types, includePersonalCollections }) =>
              handleFilterOptionsChange({
                entityTypes: types,
                includePersonalCollections,
              })
            }
          />
        </Group>
        {error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <ContentDiagnosticsTable
            findings={visibleFindings}
            isLoading={isLoading}
            onSelect={(finding) => setSelectedFindingId(finding.id)}
          />
        )}
        {!isLoading && error == null && (
          <DiagnosticsPagination
            page={page}
            pageSize={PAGE_SIZE}
            pageItemCount={findings.length}
            totalCount={totalCount}
            onPageChange={handlePageChange}
          />
        )}
      </Stack>
    </Flex>
  );
}
