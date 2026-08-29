import { useEffect, useState } from "react";
import { t } from "ttag";
import { findWhere } from "underscore";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellCacheConfig } from "metabase/admin/upsells";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PLUGIN_CACHING } from "metabase/plugins";
import { Box, Flex } from "metabase/ui";

import { rootId } from "../constants/simple";
import { useCacheConfigs } from "../hooks/useCacheConfigs";
import { useConfirmIfFormIsDirty } from "../hooks/useConfirmIfFormIsDirty";
import { useSaveStrategy } from "../hooks/useSaveStrategy";

import { PerformancePageContent } from "./PerformancePageContent";
import S from "./StrategyEditorForDatabases.module.css";
import { StrategyForm } from "./StrategyForm";

export const StrategyEditorForDatabases = () => {
  if (PLUGIN_CACHING.canOverrideRootStrategy) {
    return <PLUGIN_CACHING.DatabaseCachingEditor />;
  }
  return <RootCachingStrategyEditor />;
};

const RootCachingStrategyEditor = () => {
  const [
    // The targetId is the id of the model that is currently being edited
    targetId,
    setTargetId,
  ] = useState<number | null>(null);

  const {
    configs,
    error: configsError,
    isLoading: areConfigsLoading,
  } = useCacheConfigs({ model: ["root"] });

  /** The config for the model currently being edited */
  const targetConfig = findWhere(configs ?? [], {
    model_id: targetId ?? undefined,
  });

  const savedStrategy = targetConfig?.strategy;

  const { confirmationModal, setIsStrategyFormDirty } =
    useConfirmIfFormIsDirty();

  useEffect(() => {
    if (targetId === null) {
      setTargetId(rootId);
    }
  }, [targetId]);

  const saveStrategy = useSaveStrategy(targetId, "database");

  if (configsError || areConfigsLoading) {
    return (
      <DelayedLoadingAndErrorWrapper
        error={configsError}
        loading={areConfigsLoading}
      />
    );
  }

  return (
    <PerformancePageContent>
      <SettingsPageWrapper
        title={t`Database caching`}
        aria-label={t`Data caching settings`}
        description={t`Speed up queries by caching their results.`}
        h="calc(100vh - 9rem)"
      >
        {confirmationModal}
        <Flex gap="xl" className={S.scrollableLayout}>
          <Box
            w="100%"
            maw="30rem"
            bd="2px solid var(--mb-color-border-neutral)"
            className={S.roundedBox}
          >
            <Box
              component="section"
              bg="background_page-primary"
              h="100%"
              className={S.formPanel}
            >
              {targetId !== null && (
                <StrategyForm
                  targetId={targetId}
                  targetModel="root"
                  targetName={t`Default policy`}
                  setIsDirty={setIsStrategyFormDirty}
                  saveStrategy={saveStrategy}
                  savedStrategy={savedStrategy}
                  shouldAllowInvalidation={false}
                  shouldShowName={false}
                />
              )}
            </Box>
          </Box>
          <UpsellCacheConfig location="performance-data_cache" />
        </Flex>
      </SettingsPageWrapper>
    </PerformancePageContent>
  );
};
