import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { Table } from "metabase/common/components/Table";
import type { ColumnItem } from "metabase/common/components/Table/types";
import { usePagination } from "metabase/common/hooks/use-pagination";
import { Center, Flex, Repeat, Skeleton, Stack } from "metabase/ui";
import type { CacheSortColumn, CacheableModel } from "metabase-types/api";
import { CacheDurationUnit } from "metabase-types/api";
import type { SortDirection } from "metabase-types/api/sorting";

import type { CacheableItem, UpdateTarget } from "../types";

import Styles from "./StrategyEditorForQuestionsAndDashboards.module.css";
import { TableRowForCacheableItem } from "./TableRowForCacheableItem";
import { getConstants } from "./constants";

const PAGE_SIZE = 25;

export const StrategyEditorForQuestionsAndDashboards = () => {
  const [
    // The targetId is the id of the object that is currently being edited
    targetId,
    setTargetId,
  ] = useState<number | null>(null);

  const { tableColumns } = useMemo(() => getConstants(), []);

  const [targetModel, setTargetModel] = useState<CacheableModel | null>(null);

  const { page, setPage, resetPage } = usePagination();

  const [sortColumn, setSortColumn] = useState<CacheSortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const { configs, total, error, isLoading } = useCacheConfigs({
    model: ["dashboard", "question"],
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort_column: sortColumn,
    sort_direction: sortDirection,
  });

  // Handle sort column click
  const handleSort = useCallback(
    (columnName: string, direction: SortDirection) => {
      setSortColumn(columnName as CacheSortColumn);
      setSortDirection(direction);
      resetPage();
    },
    [resetPage],
  );

  const cacheableItems: CacheableItem[] = useMemo(() => {
    if (configs === undefined) {
      return [];
    }
    return configs
      .filter((config) => config.name !== undefined)
      .map((config) => ({
        id: config.model_id,
        model: config.model,
        strategy: config.strategy,
        name: config.name,
        collection: config.collection ?? undefined,
        iconModel: config.model === "question" ? "card" : "dashboard",
      }));
  }, [configs]);

  useEffect(
    /** When the user configures an item to 'Use default' and that item
     * disappears from the table, it should no longer be the target */
    function removeTargetIfNoLongerInTable() {
      const isTargetIdInTable = cacheableItems.some(
        (item) => item.id === targetId,
      );
      if (targetId !== null && !isTargetIdInTable) {
        setTargetId(null);
        setTargetModel(null);
      }
    },
    [targetId, cacheableItems],
  );

  /** The config for the object currently being edited */
  const targetConfig =
    configs && targetModel
      ? _.findWhere(configs, {
          model_id: targetId ?? undefined,
          model: targetModel,
        })
      : undefined;

  const savedStrategy = useMemo(() => {
    const strategy = targetConfig?.strategy;
    if (!strategy) {
      return undefined;
    }
    if (strategy.type === "duration") {
      return { ...strategy, unit: CacheDurationUnit.Hours };
    }
    return { ...strategy };
  }, [targetConfig?.strategy]);

  const targetName = useMemo(() => {
    if (targetId === null || targetModel === null) {
      return;
    }
    const item = _.findWhere(cacheableItems, {
      id: targetId,
      model: targetModel,
    });
    return item?.name;
  }, [targetId, targetModel, cacheableItems]);

  const {
    askBeforeDiscardingChanges,
    confirmationModal,
    isStrategyFormDirty,
    setIsStrategyFormDirty,
  } = useConfirmIfFormIsDirty();

  /** Change the target, but first confirm if the form is unsaved */
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

  const hasPagination = (total ?? 0) > PAGE_SIZE;

  const rowRenderer = useCallback(
    (item: CacheableItem) => (
      <TableRowForCacheableItem
        updateTarget={updateTarget}
        currentTargetId={targetId}
        currentTargetModel={targetModel}
        forId={item.id}
        item={item}
        isFormDirty={isStrategyFormDirty}
      />
    ),
    [updateTarget, targetId, targetModel, isStrategyFormDirty],
  );

  const explanatoryAsideId = "mb-explanatory-aside";

  const closeForm = useCallback(() => {
    updateTarget({ id: null, model: null }, isStrategyFormDirty);
  }, [updateTarget, isStrategyFormDirty]);

  return (
    <SettingsPageWrapper
      title={t`Caching for dashboards and questions`}
      description={t`Here are the dashboards and questions that have their own caching policies, which override any default or database policies you’ve set.`}
    >
      <Stack
        gap="xl"
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        {confirmationModal}
        <Flex>
          <DelayedLoadingAndErrorWrapper
            error={error}
            loading={isLoading}
            loader={<TableSkeleton columns={tableColumns} />}
          >
            <Table<CacheableItem>
              className={Styles.CacheableItemTable}
              columns={tableColumns}
              data-testid="cache-config-table"
              rows={cacheableItems}
              rowRenderer={rowRenderer}
              emptyBody={<NoResultsTableRow />}
              aria-labelledby={explanatoryAsideId}
              sortColumnName={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              cols={
                <>
                  <col />
                  <col />
                  <col />
                </>
              }
              paginationProps={
                hasPagination
                  ? {
                      page,
                      pageSize: PAGE_SIZE,
                      total,
                      showTotal: true,
                      onPageChange: setPage,
                    }
                  : undefined
              }
            />
          </DelayedLoadingAndErrorWrapper>
        </Flex>
      </Stack>

      <Sidesheet
        isOpen={targetId !== null && targetModel !== null}
        onClose={closeForm}
        title={targetName ?? `Untitled ${targetModel}`}
      >
        {targetModel && (
          <StrategyForm
            targetId={targetId}
            targetModel={targetModel}
            targetName=""
            setIsDirty={setIsStrategyFormDirty}
            saveStrategy={saveStrategy}
            savedStrategy={savedStrategy}
            shouldAllowInvalidation={true}
            shouldShowName={false}
            isInSidebar
          />
        )}
      </Sidesheet>
    </SettingsPageWrapper>
  );
};

const TableSkeleton = ({ columns }: { columns: ColumnItem[] }) => (
  <Table<{ id: number }>
    columns={columns}
    rows={[{ id: 0 }, { id: 1 }, { id: 2 }]}
    rowRenderer={() => (
      <tr className={Styles.SkeletonTableRow}>
        <Repeat times={3}>
          <td>
            <Skeleton h="1rem" natural />
          </td>
        </Repeat>
      </tr>
    )}
    className={Styles.CacheableItemTable}
  />
);

const NoResultsTableRow = () => (
  <Center fw="bold" c="text-tertiary">
    {t`No dashboards or questions have their own caching policies yet.`}
  </Center>
);
