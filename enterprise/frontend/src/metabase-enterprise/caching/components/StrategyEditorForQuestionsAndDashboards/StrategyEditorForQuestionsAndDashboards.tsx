import type { SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { PerformancePageContent } from "metabase/admin/performance/components/PerformancePageContent";
import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import {
  defaultRootStrategy,
  rootId,
} from "metabase/admin/performance/constants/simple";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { DebouncedSearchInput } from "metabase/common/components/DebouncedSearchInput";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Center, Flex, Text } from "metabase/ui";
import type { CacheableModel } from "metabase-types/api";

import { PolicySidePanel } from "../PolicySidePanel";
import {
  DEFAULT_POLICY_TABLE_SORTING,
  PolicyTable,
  type PolicyTableRowBase,
  getAdjacentRows,
  sortPolicyRows,
} from "../PolicyTable";
import type { UpdateTarget } from "../types";

import {
  type CachingFilters,
  CachingPoliciesFilters,
  EMPTY_CACHING_FILTERS,
} from "./CachingPoliciesFilters";

const PAGE_SIZE = 25;
const MIN_ITEMS_TO_SHOW_SEARCH = 11;

type ItemRow = PolicyTableRowBase & {
  itemId: number;
  model: CacheableModel;
};

export const StrategyEditorForQuestionsAndDashboards = () => {
  const getIcon = useGetIcon();

  const [
    // The targetId is the id of the object that is currently being edited
    targetId,
    setTargetId,
  ] = useState<number | null>(null);
  const [targetModel, setTargetModel] = useState<CacheableModel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<CachingFilters>(EMPTY_CACHING_FILTERS);
  const [sorting, setSorting] = useState<SortingState>(
    DEFAULT_POLICY_TABLE_SORTING,
  );
  const { page, setPage, resetPage } = usePagination();

  // Fetched without a limit so search/filter/sort/pagination can run client
  // side: the list only holds items with their own policies, so it stays small
  const { configs, error, isLoading } = useCacheConfigs({
    model: ["root", "dashboard", "question"],
  });

  const rootStrategy =
    _.findWhere(configs ?? [], { model_id: rootId })?.strategy ??
    defaultRootStrategy;

  const allRows: ItemRow[] = useMemo(() => {
    return (configs ?? [])
      .filter((config) => config.model !== "root" && config.name !== undefined)
      .map((config) => ({
        id: `${config.model}:${config.model_id}`,
        itemId: config.model_id,
        model: config.model,
        name: config.name ?? "",
        icon: getIcon({
          model: config.model === "question" ? "card" : "dashboard",
        }).name,
        collection: config.collection ?? null,
        policyLabel: getShortStrategyLabel(config.strategy) ?? null,
        usesDefaultPolicy: _.isEqual(config.strategy, rootStrategy),
      }));
  }, [configs, rootStrategy, getIcon]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allRows.filter((row) => {
      const matchesSearch =
        query === "" ||
        row.name.toLowerCase().includes(query) ||
        row.collection?.name?.toLowerCase().includes(query);
      const matchesPolicy =
        filters.policy === null ||
        (filters.policy === "default") === row.usesDefaultPolicy;
      const matchesType = filters.type === null || filters.type === row.model;
      return matchesSearch && matchesPolicy && matchesType;
    });
  }, [allRows, searchQuery, filters]);

  const sortedRows = useMemo(
    () => sortPolicyRows(filteredRows, sorting),
    [filteredRows, sorting],
  );

  const paginatedRows = useMemo(
    () => sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sortedRows, page],
  );

  const shouldShowControls = allRows.length >= MIN_ITEMS_TO_SHOW_SEARCH;

  const {
    askBeforeDiscardingChanges,
    confirmationModal,
    isStrategyFormDirty,
    setIsStrategyFormDirty,
  } = useConfirmIfFormIsDirty();

  useEffect(
    /** When the user configures an item to 'Use default' and that item
     * disappears from the table, it should no longer be the target */
    function removeTargetIfNoLongerInTable() {
      const isTargetInTable = allRows.some(
        (row) => row.itemId === targetId && row.model === targetModel,
      );
      if (targetId !== null && !isTargetInTable) {
        setTargetId(null);
        setTargetModel(null);
        // The form unmounts mid-save with its values still differing from the
        // deleted config, so nothing else would clear the dirty flag
        setIsStrategyFormDirty(false);
      }
    },
    [targetId, targetModel, allRows, setIsStrategyFormDirty],
  );

  const targetConfig =
    configs && targetModel
      ? _.findWhere(configs, {
          model_id: targetId ?? undefined,
          model: targetModel,
        })
      : undefined;

  const savedStrategy = targetConfig?.strategy;

  const targetRow = useMemo(
    () =>
      allRows.find(
        (row) => row.itemId === targetId && row.model === targetModel,
      ),
    [allRows, targetId, targetModel],
  );

  const updateTarget: UpdateTarget = useCallback(
    ({ id: newTargetId, model: newTargetModel }, isFormDirty) => {
      if (targetId !== newTargetId || targetModel !== newTargetModel) {
        const update = () => {
          setTargetId(newTargetId);
          setTargetModel(newTargetModel);
          setIsStrategyFormDirty(false);
        };
        if (isFormDirty) {
          askBeforeDiscardingChanges(update);
        } else {
          update();
        }
      }
    },
    [
      targetId,
      targetModel,
      setTargetId,
      setTargetModel,
      setIsStrategyFormDirty,
      askBeforeDiscardingChanges,
    ],
  );

  const saveStrategy = useSaveStrategy(targetId, targetModel);

  const targetRowIndex = paginatedRows.findIndex(
    (row) => row.itemId === targetId && row.model === targetModel,
  );
  const { previousRow, nextRow } = getAdjacentRows(
    paginatedRows,
    targetRowIndex,
  );

  const navigateToRow = useCallback(
    (row: ItemRow) =>
      updateTarget({ id: row.itemId, model: row.model }, isStrategyFormDirty),
    [updateTarget, isStrategyFormDirty],
  );

  const closeForm = useCallback(() => {
    updateTarget({ id: null, model: null }, isStrategyFormDirty);
  }, [updateTarget, isStrategyFormDirty]);

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      resetPage();
    },
    [resetPage],
  );

  const handleFiltersChange = useCallback(
    (nextFilters: CachingFilters) => {
      setFilters(nextFilters);
      resetPage();
    },
    [resetPage],
  );

  const handleSortingChange = useCallback(
    (nextSorting: SortingState) => {
      setSorting(nextSorting);
      resetPage();
    },
    [resetPage],
  );

  if (error || isLoading) {
    return <DelayedLoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <Flex h="100%" wrap="nowrap">
      <PerformancePageContent>
        <SettingsPageWrapper
          title={t`Dashboard and question caching`}
          description={t`These dashboards and questions have custom caching policies that override default or database-level policies.`}
          descriptionProps={{ maw: "100%" }}
          h="calc(100vh - 9rem)"
        >
          {confirmationModal}
          {shouldShowControls && (
            <Flex gap="md" align="center">
              <DebouncedSearchInput
                value={searchQuery}
                placeholder={t`Search by name or collection…`}
                onChange={handleSearchChange}
              />
              <CachingPoliciesFilters
                filters={filters}
                onChange={handleFiltersChange}
              />
            </Flex>
          )}
          <PolicyTable
            rows={paginatedRows}
            withCollectionColumn
            sorting={sorting}
            onSortingChange={handleSortingChange}
            selectedRowId={targetRow?.id ?? null}
            onRowClick={navigateToRow}
            emptyState={
              <Center p="xl">
                <Text fw="bold" c="text-secondary">
                  {allRows.length === 0
                    ? t`No dashboards or questions have their own caching policies yet.`
                    : t`No results`}
                </Text>
              </Center>
            }
            data-testid="cache-config-table"
          />
          {sortedRows.length > PAGE_SIZE && (
            <Flex justify="end">
              <PaginationControls
                page={page}
                pageSize={PAGE_SIZE}
                itemsLength={paginatedRows.length}
                total={sortedRows.length}
                showTotal
                onPreviousPage={() => setPage(page - 1)}
                onNextPage={() => setPage(page + 1)}
              />
            </Flex>
          )}
        </SettingsPageWrapper>
      </PerformancePageContent>
      {targetId !== null && targetModel !== null && (
        <PolicySidePanel
          title={
            targetRow?.name ??
            (targetModel === "dashboard"
              ? t`Untitled dashboard`
              : t`Untitled question`)
          }
          subtitle={targetRow?.collection?.name}
          onPrevious={
            previousRow ? () => navigateToRow(previousRow) : undefined
          }
          onNext={nextRow ? () => navigateToRow(nextRow) : undefined}
          onClose={closeForm}
        >
          <StrategyForm
            targetId={targetId}
            targetModel={targetModel}
            targetName=""
            setIsDirty={setIsStrategyFormDirty}
            saveStrategy={saveStrategy}
            savedStrategy={savedStrategy}
            shouldAllowInvalidation={true}
            shouldShowName={false}
            onCancel={closeForm}
            layout="sidebar"
          />
        </PolicySidePanel>
      )}
    </Flex>
  );
};
