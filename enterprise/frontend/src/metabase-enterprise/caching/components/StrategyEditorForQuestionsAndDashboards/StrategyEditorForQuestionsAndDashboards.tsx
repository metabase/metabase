import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { skipToken, useSearchQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { ClientSortableTable } from "metabase/common/components/Table/ClientSortableTable";
import type { ColumnItem } from "metabase/common/components/Table/types";
import { Center, Flex, Repeat, Skeleton, Stack } from "metabase/ui";
import type { CacheableModel } from "metabase-types/api";
import { CacheDurationUnit } from "metabase-types/api";
import { SortDirection } from "metabase-types/api/sorting";

import type {
  CacheableItem,
  DashboardResult,
  QuestionResult,
  UpdateTarget,
} from "../types";

import Styles from "./StrategyEditorForQuestionsAndDashboards.module.css";
import { TableRowForCacheableItem } from "./TableRowForCacheableItem";
import { getConstants } from "./constants";
import { formatValueForSorting } from "./utils";

type CacheableItemResult = DashboardResult | QuestionResult;

export const StrategyEditorForQuestionsAndDashboards = () => {
  const [
    // The targetId is the id of the object that is currently being edited
    targetId,
    setTargetId,
  ] = useState<number | null>(null);

  const { tableColumns } = useMemo(() => getConstants(), []);

  const [targetModel, setTargetModel] = useState<CacheableModel | null>(null);

  const configurableModels: CacheableModel[] = useMemo(
    () => ["dashboard", "question"],
    [],
  );

  const {
    configs,
    setConfigs,
    error: configsError,
    loading: configsAreLoading,
  } = useCacheConfigs({ configurableModels });

  const dashboardIds = useMemo(
    () =>
      configs
        .filter((config) => config.model === "dashboard")
        .map((c) => c.model_id),
    [configs],
  );

  const questionIds = useMemo(
    () =>
      configs
        .filter((config) => config.model === "question")
        .map((c) => c.model_id),
    [configs],
  );

  const dashboardsResult = useSearchQuery(
    dashboardIds.length
      ? {
          models: ["dashboard"],
          ids: dashboardIds,
          //FIXME: Add `ancestors: true` once jds/ancestors-for-all-the-things is merged
        }
      : skipToken,
  );
  const questionsResult = useSearchQuery(
    questionIds.length
      ? {
          models: ["card"],
          ids: questionIds,
          include_dashboard_questions: true,
          //FIXME: Add `ancestors: true` once jds/ancestors-for-all-the-things is merged
        }
      : skipToken,
  );

  const dashboardsAndQuestions = useMemo(
    () =>
      (dashboardsResult.data?.data || []).concat(
        questionsResult.data?.data || [],
      ) as CacheableItemResult[],
    [dashboardsResult.data, questionsResult.data],
  );

  const cacheableItems = useMemo(() => {
    const items = new Map<string, CacheableItem>();
    for (const config of configs) {
      items.set(`${config.model}${config.model_id}`, {
        ..._.omit(config, "model_id"),
        id: config.model_id,
      });
    }

    // Hydrate data from the search results into the cacheable items
    for (const result of dashboardsAndQuestions ?? []) {
      const normalizedModel =
        result.model === "card" ? "question" : result.model;
      const item = items.get(`${normalizedModel}${result.id}`);
      if (item) {
        item.name = result.name;
        item.collection = result.collection;
        item.iconModel = result.model;
      }
    }
    // Filter out items that have no match in the dashboard and question list
    const hydratedCacheableItems: CacheableItem[] = [...items.values()].filter(
      (item) => item.name !== undefined,
    );

    return hydratedCacheableItems;
  }, [configs, dashboardsAndQuestions]);

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
  const targetConfig = targetModel
    ? _.findWhere(configs, {
        model_id: targetId ?? undefined,
        model: targetModel,
      })
    : undefined;
  const savedStrategy = targetConfig?.strategy;

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

  if (savedStrategy?.type === "duration") {
    savedStrategy.unit = CacheDurationUnit.Hours;
  }

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
        isFormDirty ? askBeforeDiscardingChanges(update) : update();
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

  const saveStrategy = useSaveStrategy(
    targetId,
    configs,
    setConfigs,
    targetModel,
  );

  const cacheableItemsAreLoading = configs.length > 0 && !cacheableItems.length;

  const error = configsError || dashboardsResult.error || questionsResult.error;
  const loading =
    configsAreLoading ||
    dashboardsResult.isLoading ||
    questionsResult.isLoading ||
    cacheableItemsAreLoading;

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
            loading={loading}
            loader={<TableSkeleton columns={tableColumns} />}
          >
            <Flex align="flex-start">
              <ClientSortableTable<CacheableItem>
                className={Styles.CacheableItemTable}
                columns={tableColumns}
                data-testid="cache-config-table"
                rows={cacheableItems}
                rowRenderer={rowRenderer}
                defaultSortColumn="name"
                defaultSortDirection={SortDirection.Asc}
                formatValueForSorting={formatValueForSorting}
                emptyBody={<NoResultsTableRow />}
                aria-labelledby={explanatoryAsideId}
                cols={
                  <>
                    <col />
                    <col />
                    <col />
                  </>
                }
              />
            </Flex>
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
  <ClientSortableTable<{ id: number }>
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
