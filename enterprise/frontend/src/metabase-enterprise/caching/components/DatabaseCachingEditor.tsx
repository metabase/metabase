import type { SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { findWhere } from "underscore";

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
import type { UpdateTargetId } from "metabase/admin/performance/types";
import { getShortStrategyLabel } from "metabase/admin/performance/utils";
import {
  useDeleteCacheConfigsMutation,
  useListDatabasesQuery,
} from "metabase/api";
import { DebouncedSearchInput } from "metabase/common/components/DebouncedSearchInput";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { ActionIcon, Center, Flex, Icon, Text, Tooltip } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { PolicySidePanel } from "./PolicySidePanel";
import {
  DEFAULT_POLICY_TABLE_SORTING,
  PolicyTable,
  type PolicyTableRowBase,
  getAdjacentRows,
  sortPolicyRows,
} from "./PolicyTable";

type DatabaseRow = PolicyTableRowBase & {
  targetId: number;
  ariaLabel: string;
};

const emptyDatabaseList: Database[] = [];
const MIN_ITEMS_TO_SHOW_SEARCH = 11;

export const DatabaseCachingEditor = () => {
  const dispatch = useDispatch();

  const [
    // The targetId is the id of the model that is currently being edited
    targetId,
    setTargetId,
  ] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>(
    DEFAULT_POLICY_TABLE_SORTING,
  );

  const {
    configs,
    error: configsError,
    isLoading: areConfigsLoading,
  } = useCacheConfigs({ model: ["root", "database"] });

  const databasesResult = useListDatabasesQuery();
  const databases = databasesResult.data?.data ?? emptyDatabaseList;

  const rootStrategy =
    findWhere(configs ?? [], { model_id: rootId })?.strategy ??
    defaultRootStrategy;

  const allRows: DatabaseRow[] = useMemo(() => {
    const rootPolicyLabel = getShortStrategyLabel(rootStrategy);
    const databaseRows = databases.map((database) => {
      const config = findWhere(configs ?? [], {
        model: "database",
        model_id: database.id,
      });
      const policyLabel =
        getShortStrategyLabel(config?.strategy ?? rootStrategy) ?? null;
      return {
        id: `database:${database.id}`,
        targetId: database.id,
        name: database.name,
        icon: "database" as const,
        policyLabel,
        usesDefaultPolicy: config === undefined, // "Uses the default policy" here means inheritance: no config of its own
        ariaLabel:
          config === undefined
            ? t`Edit policy for database '${database.name}' (currently inheriting the default policy, ${rootPolicyLabel})`
            : t`Edit policy for database '${database.name}' (currently: ${policyLabel})`,
      };
    });
    const defaultPolicyRow: DatabaseRow = {
      id: "root",
      targetId: rootId,
      name: t`Default policy`,
      icon: "star",
      policyLabel: rootPolicyLabel ?? null,
      usesDefaultPolicy: false,
      ariaLabel: t`Edit default policy (currently: ${rootPolicyLabel})`,
    };
    // The default policy row stays pinned at the top regardless of sorting
    return [defaultPolicyRow, ...sortPolicyRows(databaseRows, sorting)];
  }, [databases, configs, rootStrategy, sorting]);

  const query = searchQuery.trim().toLowerCase();
  const visibleRows =
    query === ""
      ? allRows
      : allRows.filter(
          (row) =>
            row.name.toLowerCase().includes(query) ||
            row.policyLabel?.toLowerCase().includes(query),
        );

  const shouldShowSearch = databases.length >= MIN_ITEMS_TO_SHOW_SEARCH;

  const {
    askBeforeDiscardingChanges,
    confirmationModal,
    isStrategyFormDirty,
    setIsStrategyFormDirty,
  } = useConfirmIfFormIsDirty();

  const updateTargetId: UpdateTargetId = useCallback(
    (newTargetId, isFormDirty) => {
      if (targetId !== newTargetId) {
        const update = () => {
          setTargetId(newTargetId);
          // Closing the sidesheet unmounts the form, so nothing else would
          // clear the dirty flag after the user discards their changes
          setIsStrategyFormDirty(false);
        };
        if (isFormDirty) {
          askBeforeDiscardingChanges(update);
        } else {
          update();
        }
      }
    },
    [targetId, askBeforeDiscardingChanges, setIsStrategyFormDirty],
  );

  const targetDatabase = databases.find((db) => db.id === targetId);
  const targetConfig = findWhere(configs ?? [], {
    model_id: targetId ?? undefined,
  });
  const savedStrategy = targetConfig?.strategy;

  const shouldAllowInvalidation = useMemo(() => {
    if (
      targetId === null ||
      targetId === rootId ||
      savedStrategy?.type === "nocache"
    ) {
      return false;
    }
    const inheritingRootStrategy = ["inherit", undefined].includes(
      savedStrategy?.type,
    );
    const rootConfig = findWhere(configs ?? [], { model_id: rootId });
    const inheritingDoNotCache =
      inheritingRootStrategy && !rootConfig?.strategy;
    return !inheritingDoNotCache;
  }, [configs, savedStrategy?.type, targetId]);

  const saveStrategy = useSaveStrategy(targetId, "database");

  const overriddenDatabaseIds = useMemo(
    () =>
      (configs ?? [])
        .filter((config) => config.model === "database")
        .map((config) => config.model_id),
    [configs],
  );

  const [deleteCacheConfigs] = useDeleteCacheConfigsMutation();
  const { show: showResetConfirmation, modalContent: resetConfirmationModal } =
    useConfirmation();

  const showResetAllConfirmation = useCallback(() => {
    showResetConfirmation({
      title: t`Reset all to default?`,
      message: t`This will reset all database caching policies to their default values.`,
      confirmButtonText: t`Reset all to default`,
      onConfirm: async () => {
        try {
          await deleteCacheConfigs({
            model: "database",
            model_id: overriddenDatabaseIds,
          }).unwrap();
        } catch {
          dispatch(
            addUndo({
              icon: "warning",
              message: t`Could not reset the caching policies.`,
            }),
          );
        }
      },
    });
  }, [
    showResetConfirmation,
    deleteCacheConfigs,
    overriddenDatabaseIds,
    dispatch,
  ]);

  const handleResetAllToDefault = useCallback(() => {
    if (isStrategyFormDirty) {
      askBeforeDiscardingChanges(() => {
        setIsStrategyFormDirty(false);
        showResetAllConfirmation();
      });
    } else {
      showResetAllConfirmation();
    }
  }, [
    isStrategyFormDirty,
    askBeforeDiscardingChanges,
    setIsStrategyFormDirty,
    showResetAllConfirmation,
  ]);

  const targetRowIndex = visibleRows.findIndex(
    (row) => row.targetId === targetId,
  );
  const { previousRow, nextRow } = getAdjacentRows(visibleRows, targetRowIndex);

  const closePanel = useCallback(() => {
    updateTargetId(null, isStrategyFormDirty);
  }, [updateTargetId, isStrategyFormDirty]);

  const error = configsError || databasesResult.error;
  const loading = areConfigsLoading || databasesResult.isLoading;
  if (error || loading) {
    return <DelayedLoadingAndErrorWrapper error={error} loading={loading} />;
  }

  return (
    <Flex h="100%" wrap="nowrap">
      <PerformancePageContent>
        <SettingsPageWrapper
          title={
            <Flex flex={1} justify="space-between" align="center">
              {t`Database caching`}
              {overriddenDatabaseIds.length > 0 && (
                <Tooltip label={t`Reset all to default`}>
                  <ActionIcon
                    size="lg"
                    c="icon-primary"
                    bd="1px solid var(--mb-color-border-neutral)"
                    aria-label={t`Reset all to default`}
                    onClick={handleResetAllToDefault}
                  >
                    <Icon name="revert" />
                  </ActionIcon>
                </Tooltip>
              )}
            </Flex>
          }
          aria-label={t`Data caching settings`}
          description={t`Speed up queries by caching results with a global policy or database-specific policies.`}
          descriptionProps={{ maw: "100%" }}
          h="calc(100vh - 9rem)"
        >
          {confirmationModal}
          {resetConfirmationModal}
          {shouldShowSearch && (
            <DebouncedSearchInput
              flex={0}
              value={searchQuery}
              placeholder={t`Search by name or policy…`}
              onChange={setSearchQuery}
            />
          )}
          <PolicyTable
            rows={visibleRows}
            sorting={sorting}
            onSortingChange={setSorting}
            selectedRowId={visibleRows[targetRowIndex]?.id ?? null}
            onRowClick={(row) =>
              updateTargetId(row.targetId, isStrategyFormDirty)
            }
            getRowProps={(row) => ({
              "aria-label": row.original.ariaLabel,
              "data-testid": `policy-row-${row.original.targetId}`,
            })}
            emptyState={
              <Center p="xl">
                <Text fw="bold" c="text-secondary">{t`No results`}</Text>
              </Center>
            }
            data-testid="database-caching-table"
          />
        </SettingsPageWrapper>
      </PerformancePageContent>
      {targetId !== null && (
        <PolicySidePanel
          title={
            targetId === rootId
              ? t`Default policy`
              : targetDatabase?.name || t`Untitled database`
          }
          onPrevious={
            previousRow
              ? () => updateTargetId(previousRow.targetId, isStrategyFormDirty)
              : undefined
          }
          onNext={
            nextRow
              ? () => updateTargetId(nextRow.targetId, isStrategyFormDirty)
              : undefined
          }
          onClose={closePanel}
        >
          <StrategyForm
            targetId={targetId}
            targetModel={targetId === rootId ? "root" : "database"}
            targetName={targetDatabase?.name || t`Untitled database`}
            setIsDirty={setIsStrategyFormDirty}
            saveStrategy={saveStrategy}
            savedStrategy={savedStrategy}
            shouldAllowInvalidation={shouldAllowInvalidation}
            shouldShowName={false}
            onCancel={closePanel}
            layout="sidebar"
          />
        </PolicySidePanel>
      )}
    </Flex>
  );
};
