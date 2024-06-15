import { useCallback, useEffect, useMemo, useState } from "react";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { Panel } from "metabase/admin/performance/components/StrategyEditorForDatabases.styled";
import { StrategyForm } from "metabase/admin/performance/components/StrategyForm";
import { rootId } from "metabase/admin/performance/constants/simple";
import { useCacheConfigs } from "metabase/admin/performance/hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "metabase/admin/performance/hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "metabase/admin/performance/hooks/useSaveStrategy";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import { useSearchQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center, Flex, Skeleton, Stack } from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import type { CacheableModel } from "metabase-types/api";
import { CacheDurationUnit } from "metabase-types/api";

import { CacheableItemTable } from "./StrategyEditorForQuestionsAndDashboards.styled";
import { TableRowForCacheableItem } from "./TableRowForCacheableItem";
import type {
  CacheableItem,
  DashboardResult,
  QuestionResult,
  UpdateTarget,
} from "./types";

const tableColumns = [
  { key: "name", name: t`Name`, sortable: true },
  { key: "policy", name: t`Policy`, sortable: true },
];

type CacheableItemResult = DashboardResult | QuestionResult;

const StrategyEditorForQuestionsAndDashboards_Base = ({
  router,
  route,
}: {
  router: InjectedRouter;
  route?: Route;
}) => {
  const [
    // The targetId is the id of the object that is currently being edited
    targetId,
    setTargetId,
  ] = useState<number | null>(null);

  const [targetModel, setTargetModel] = useState<CacheableModel | null>(null);

  const configurableModels: CacheableModel[] = useMemo(() => {
    return ["dashboard", "question"];
  }, []);

  const {
    configs,
    setConfigs,
    error: configsError,
    loading: areConfigsLoading,
  } = useCacheConfigs({ configurableModels });

  // FIXME: If possible, just get the objects needed by id and model
  const searchResult = useSearchQuery({
    models: ["dashboard", "card"],
  });

  const dashboardsAndQuestions = useMemo(
    () => (searchResult.data?.data || []) as CacheableItemResult[],
    [searchResult.data],
  );

  const cacheableItems = useMemo(() => {
    const items = new Map<string, CacheableItem>();
    for (const config of configs) {
      items.set(`${config.model}${config.model_id}`, {
        ..._.omit(config, "model_id"),
        id: config.model_id,
      });
    }

    for (const result of dashboardsAndQuestions ?? []) {
      const formattedModel =
        result.model === "card" ? "question" : result.model;
      const item = items.get(`${formattedModel}${result.id}`);
      if (item) {
        item.name = result.name;
      }
    }
    const cacheableItems = [...items.values()];
    // Filter out items that have no match in the dashboard and question list
    const hydratedCacheableItems = cacheableItems.filter(
      item => item.name !== undefined,
    );
    return hydratedCacheableItems;
  }, [configs, dashboardsAndQuestions]);

  useEffect(
    /** When an item is set to 'Use default' and it disappears from the table,
     * it should no longer be the target */
    function removeTargetIfNoLongerInTable() {
      if (
        targetId !== null &&
        !cacheableItems.some(item => item.id === targetId)
      ) {
        setTargetId(null);
        setTargetModel(null);
      }
    },
    [targetId, cacheableItems],
  );

  /** The config for the model currently being edited */
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
  } = useConfirmIfFormIsDirty(router, route);

  /** Change the target, but first confirm if the form is unsaved */
  const updateTarget: UpdateTarget = useCallback(
    ({ id: newTargetId, model: newTargetModel }, isFormDirty) => {
      if (targetId !== newTargetId || targetModel !== newTargetModel) {
        const update = () => {
          setTargetId(newTargetId);
          setTargetModel(newTargetModel);
        };
        isFormDirty ? askBeforeDiscardingChanges(update) : update();
      }
    },
    [
      targetId,
      targetModel,
      setTargetId,
      setTargetModel,
      askBeforeDiscardingChanges,
    ],
  );

  const saveStrategy = useSaveStrategy(
    targetId,
    configs,
    setConfigs,
    targetModel,
  );

  const error = configsError;
  const loading = areConfigsLoading;

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

  return (
    <Flex
      role="region"
      aria-label={t`Dashboard and question caching`}
      h="100%"
      direction="row"
      w="100%"
      // FIXME: check this gap against Figma
      gap="1rem"
      justify="space-between"
    >
      <Stack
        spacing="xl"
        lh="1.5rem"
        maw="60rem"
        pt="1rem"
        mb="1.5rem"
        style={{ flex: 1, paddingInlineStart: "2.5rem" }}
      >
        <aside>
          {t`Dashboards and questions that have their own caching policies.`}
        </aside>
        {confirmationModal}
        <Flex
          style={{
            overflow: "hidden",
          }}
          w="100%"
          mx="0"
          mb="1rem"
        >
          <DelayedLoadingAndErrorWrapper
            error={error}
            loading={loading}
            loader={<TableSkeleton />}
          >
            <Flex align="flex-start" style={{ flex: 1 }}>
              <CacheableItemTable<CacheableItem>
                style={{
                  tableLayout: "fixed",
                  flex: 1,
                }}
                columns={tableColumns}
                rows={cacheableItems}
                rowRenderer={rowRenderer}
                defaultSortColumn="name"
                defaultSortDirection="asc"
                formatValueForSorting={(
                  row: CacheableItem,
                  columnName: string,
                ) => {
                  if (columnName === "policy") {
                    return getShortStrategyLabel(row.strategy, row.model);
                  } else {
                    return _.get(row, columnName);
                  }
                }}
                ifEmpty={<EmptyTable />}
              >
                <colgroup>
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "30%" }} />
                </colgroup>
              </CacheableItemTable>
            </Flex>
          </DelayedLoadingAndErrorWrapper>
        </Flex>
      </Stack>

      <Panel
        style={{
          borderInlineStart: "1px solid var(--mb-color-border)",
          maxWidth: "30rem",
        }}
      >
        {targetId !== null && targetModel !== null && (
          <StrategyForm
            targetId={targetId}
            targetModel={targetModel}
            targetName={targetName ?? `Untitled ${targetModel}`}
            setIsDirty={setIsStrategyFormDirty}
            saveStrategy={saveStrategy}
            savedStrategy={savedStrategy}
            shouldAllowInvalidation={true}
            shouldShowName={targetId !== rootId}
          />
        )}
      </Panel>
    </Flex>
  );
};

export const StrategyEditorForQuestionsAndDashboards = withRouter(
  StrategyEditorForQuestionsAndDashboards_Base,
);

const TableSkeleton = () => (
  <CacheableItemTable<{ id: number }>
    columns={tableColumns}
    rows={[{ id: 0 }, { id: 1 }, { id: 2 }]}
    rowRenderer={() => (
      <tr>
        <Repeat times={3}>
          <td style={{ width: "10rem" }}>
            <Skeleton h="1rem" natural />
          </td>
        </Repeat>
      </tr>
    )}
  />
);

const EmptyTable = () => (
  <tr>
    <td colSpan={2}>
      <Center fw="bold" c="text-light">
        {t`No dashboards or questions have their own caching policies yet.`}
      </Center>
    </td>
  </tr>
);
