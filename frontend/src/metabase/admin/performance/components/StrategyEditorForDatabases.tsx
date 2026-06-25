import cx from "classnames";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { findWhere } from "underscore";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellCacheConfig } from "metabase/admin/upsells";
import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PLUGIN_CACHING } from "metabase/plugins";
import { Box, Flex } from "metabase/ui";
import type { CacheableModel } from "metabase-types/api";
import { CacheDurationUnit } from "metabase-types/api";

import { rootId } from "../constants/simple";
import { useCacheConfigs } from "../hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "../hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "../hooks/useSaveStrategy";
import type { UpdateTargetId } from "../types";

import S from "./StrategyEditorForDatabases.module.css";
import { StrategyForm } from "./StrategyForm";

/** Rounded outer container for the two-column launcher + form layout. */
function RoundedBox({
  children,
  twoColumns,
}: {
  children: ReactNode;
  twoColumns?: boolean;
}) {
  return (
    <Box
      w="100%"
      maw={twoColumns ? "100%" : "30rem"}
      bd="2px solid var(--mb-color-border-neutral)"
      className={cx(S.roundedBox, { [S.roundedBoxTwoColumns]: twoColumns })}
    >
      {children}
    </Box>
  );
}

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
      <Flex gap="xl" className={S.scrollableLayout}>
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
          <Box
            component="section"
            bg="background_page-primary"
            h="100%"
            className={cx(S.formPanel, {
              [S.formPanelWithLeftBorder]: canOverrideRootStrategy,
            })}
          >
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
          </Box>
        </RoundedBox>
        <UpsellCacheConfig location="performance-data_cache" />
      </Flex>
    </SettingsPageWrapper>
  );
};
