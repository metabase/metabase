import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { findWhere } from "underscore";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellCacheConfig } from "metabase/admin/upsells";
import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PLUGIN_CACHING } from "metabase/plugins";
import { Flex } from "metabase/ui";
import type { CacheableModel } from "metabase-types/api";
import { CacheDurationUnit } from "metabase-types/api";

import { rootId } from "../constants/simple";
import { useCacheConfigs } from "../hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "../hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "../hooks/useSaveStrategy";
import type { UpdateTargetId } from "../types";

import { Panel, RoundedBox } from "./StrategyEditorForDatabases.styled";
import { StrategyForm } from "./StrategyForm";

export const StrategyEditorForDatabases: React.FC = () => {
  const { canOverrideRootStrategy } = PLUGIN_CACHING;

  const [
    // The targetId is the id of the model that is currently being edited
    targetId,
    setTargetId,
  ] = useState<number | null>(null);

  const model: CacheableModel[] = useMemo(() => {
    const ret: CacheableModel[] = ["root"];
    if (canOverrideRootStrategy) {
      ret.push("database");
    }
    return ret;
  }, [canOverrideRootStrategy]);

  const {
    configs,
    rootStrategyOverriddenOnce,
    rootStrategyRecentlyOverridden,
    error: configsError,
    isLoading: areConfigsLoading,
  } = useCacheConfigs({ model });

  const databasesResult = useListDatabasesQuery();
  const databases = databasesResult.data?.data ?? [];

  const shouldShowResetButton =
    rootStrategyOverriddenOnce || rootStrategyRecentlyOverridden;

  /** The config for the model currently being edited */
  const targetConfig = findWhere(configs ?? [], {
    model_id: targetId ?? undefined,
  });

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

  const {
    askBeforeDiscardingChanges,
    confirmationModal,
    isStrategyFormDirty,
    setIsStrategyFormDirty,
  } = useConfirmIfFormIsDirty();

  /** Update the targetId (the id of the currently edited model) but confirm if the form is unsaved */
  const updateTargetId: UpdateTargetId = (newTargetId, isFormDirty) => {
    if (targetId !== newTargetId) {
      const update = () => setTargetId(newTargetId);
      if (isFormDirty) {
        askBeforeDiscardingChanges(update);
      } else {
        update();
      }
    }
  };

  useEffect(() => {
    if (!canOverrideRootStrategy && targetId === null) {
      setTargetId(rootId);
    }
  }, [canOverrideRootStrategy, targetId]);

  const targetDatabase = databases.find((db) => db.id === targetId);

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

  const error = configsError || databasesResult.error;
  const loading = areConfigsLoading || databasesResult.isLoading;
  if (error || loading) {
    return <DelayedLoadingAndErrorWrapper error={error} loading={loading} />;
  }

  return (
    <SettingsPageWrapper
      title={t`Database caching`}
      aria-label={t`Data caching settings`}
      description={
        <>
          {t`Speed up queries by caching their results.`}
          <PLUGIN_CACHING.GranularControlsExplanation />
        </>
      }
      h="calc(100vh - 7rem)"
    >
      {confirmationModal}
      <Flex gap="xl" style={{ overflow: "hidden" }}>
        <RoundedBox twoColumns={canOverrideRootStrategy}>
          {canOverrideRootStrategy && (
            <PLUGIN_CACHING.StrategyFormLauncherPanel
              configs={configs ?? []}
              targetId={targetId}
              updateTargetId={updateTargetId}
              databases={databases}
              isStrategyFormDirty={isStrategyFormDirty}
              shouldShowResetButton={shouldShowResetButton}
            />
          )}
          <Panel hasLeftBorder={canOverrideRootStrategy}>
            {targetId !== null && (
              <StrategyForm
                targetId={targetId}
                targetModel={targetId === rootId ? "root" : "database"}
                targetName={targetDatabase?.name || t`Untitled database`}
                setIsDirty={setIsStrategyFormDirty}
                saveStrategy={saveStrategy}
                savedStrategy={savedStrategy}
                shouldAllowInvalidation={shouldAllowInvalidation}
                shouldShowName={targetId !== rootId}
              />
            )}
          </Panel>
        </RoundedBox>
        <UpsellCacheConfig location="performance-data_cache" />
      </Flex>
    </SettingsPageWrapper>
  );
};
