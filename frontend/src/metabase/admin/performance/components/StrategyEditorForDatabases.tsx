import { useCallback, useEffect, useState } from "react";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";
import { t } from "ttag";
import { findWhere, pick } from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { CacheConfigApi } from "metabase/services";
import { Box, Stack, Title } from "metabase/ui";

import { rootId } from "../constants";
import { useCacheConfigs } from "../hooks/useCacheConfigs";
import { useConfirmOnRouteLeave } from "../hooks/useConfirmOnRouteLeave";
import { useDelayedLoadingSpinner } from "../hooks/useDelayedLoadingSpinner";
import { useHasVerticalScrollbar } from "../hooks/useHasVerticalScrollbar";
import type { Config, SafelyUpdateTargetId, Strategy } from "../types";
import { DurationUnit, getFieldsForStrategyType, Strategies } from "../types";

import { Panel, TabWrapper } from "./StrategyEditorForDatabases.styled";
import { StrategyForm } from "./StrategyForm";
import { StrategyFormLauncherPanel } from "./StrategyFormLauncherPanel";

const StrategyEditorForDatabases_Base = ({
  canOverrideRootStrategy,
  router,
  route,
}: {
  canOverrideRootStrategy: boolean;
  router: InjectedRouter;
  route?: Route;
}) => {
  const [
    // The targetId is the id of the model that is currently being edited
    targetId,
    setTargetId,
  ] = useState<number | null>(null);

  const {
    databases,
    configs,
    setConfigs,
    rootStrategyOverriddenOnce,
    rootStrategyRecentlyOverridden,
    error,
    loading,
  } = useCacheConfigs({
    canOverrideRootStrategy,
  });

  const shouldShowResetButton =
    rootStrategyOverriddenOnce || rootStrategyRecentlyOverridden;

  const shouldShowStrategyFormLaunchers = canOverrideRootStrategy;

  /** The config for the model currently being edited */
  const targetConfig = findWhere(configs, {
    model_id: targetId ?? undefined,
  });
  const savedStrategy = targetConfig?.strategy;

  if (savedStrategy?.type === "duration") {
    savedStrategy.unit = DurationUnit.Hours;
  }

  const [isStrategyFormDirty, setIsStrategyFormDirty] = useState(false);

  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();

  const askBeforeDiscardingChanges = useCallback(
    (onConfirm: () => void) =>
      askConfirmation({
        title: t`Discard your changes?`,
        message: t`Your changes haven’t been saved, so you’ll lose them if you navigate away.`,
        confirmButtonText: t`Discard`,
        onConfirm,
      }),
    [askConfirmation],
  );

  useConfirmOnRouteLeave({
    router,
    route,
    shouldConfirm: isStrategyFormDirty,
    confirm: askBeforeDiscardingChanges,
  });

  /** Update the targetId (the id of the currently edited model) but confirm if the form is unsaved */
  const safelyUpdateTargetId: SafelyUpdateTargetId = (
    newTargetId,
    isFormDirty,
  ) => {
    if (targetId === newTargetId) {
      return;
    }
    const update = () => setTargetId(newTargetId);
    if (isFormDirty) {
      askBeforeDiscardingChanges(update);
    } else {
      update();
    }
  };

  useEffect(() => {
    if (!canOverrideRootStrategy && targetId === null) {
      setTargetId(rootId);
    }
  }, [canOverrideRootStrategy, targetId]);

  const saveStrategy = useCallback(
    async (values: Strategy) => {
      if (targetId === null) {
        return;
      }

      const isRoot = targetId === rootId;
      const baseConfig: Pick<Config, "model" | "model_id"> = {
        model: isRoot ? "root" : "database",
        model_id: targetId,
      };

      const otherConfigs = configs.filter(
        config => config.model_id !== targetId,
      );
      const shouldDeleteStrategy =
        values.type === "inherit" ||
        // To set "don't cache" as the root strategy, we delete the root strategy
        (isRoot && values.type === "nocache");
      if (shouldDeleteStrategy) {
        await CacheConfigApi.delete(baseConfig, { hasBody: true });
        setConfigs(otherConfigs);
      } else {
        // If you change strategies, Formik will keep the old values
        // for fields that are not in the new strategy,
        // so let's remove these fields
        const validFields = getFieldsForStrategyType(values.type);
        const newStrategy = pick(values, validFields) as Strategy;

        const validatedStrategy =
          Strategies[values.type].validateWith.validateSync(newStrategy);

        const newConfig = {
          ...baseConfig,
          strategy: validatedStrategy,
        };

        await CacheConfigApi.update(newConfig);
        setConfigs([...otherConfigs, newConfig]);
      }
    },
    [configs, setConfigs, targetId],
  );

  const {
    hasVerticalScrollbar: formPanelHasVerticalScrollbar,
    ref: formPanelRef,
  } = useHasVerticalScrollbar();

  const showSpinner = useDelayedLoadingSpinner();

  if (error || loading) {
    return showSpinner ? (
      <LoadingAndErrorWrapper error={error} loading={loading} />
    ) : null;
  }

  return (
    <TabWrapper role="region" aria-label={t`Data caching settings`}>
      <Stack spacing="xl" lh="1.5rem" maw="32rem" mb="1.5rem">
        <aside>
          <Stack spacing="xl">
            {t`Cache the results of queries to have them display instantly. Here you can choose when cached results should be invalidated.`}
            {canOverrideRootStrategy ? (
              <>
                &nbsp;
                {t`You can set up one rule for all your databases, or apply more specific settings to each database.`}
                <Title
                  order={4}
                >{t`Pick the policy for when cached query results should be invalidated.`}</Title>{" "}
              </>
            ) : null}
          </Stack>
        </aside>
      </Stack>
      {confirmationModal}
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(5rem, 30rem) minmax(5rem, auto)",
          overflow: "hidden",
        }}
        w="100%"
        mx="0"
        mb="1rem"
      >
        {shouldShowStrategyFormLaunchers && (
          <StrategyFormLauncherPanel
            configs={configs}
            setConfigs={setConfigs}
            targetId={targetId}
            safelyUpdateTargetId={safelyUpdateTargetId}
            databases={databases}
            isStrategyFormDirty={isStrategyFormDirty}
            shouldShowResetButton={shouldShowResetButton}
          />
        )}
        <Panel
          ref={formPanelRef}
          hasVerticalScrollbar={formPanelHasVerticalScrollbar}
        >
          {targetId !== null && (
            <StrategyForm
              targetId={targetId}
              setIsDirty={setIsStrategyFormDirty}
              saveStrategy={saveStrategy}
              savedStrategy={savedStrategy}
            />
          )}
        </Panel>
      </Box>
    </TabWrapper>
  );
};

export const StrategyEditorForDatabases = withRouter(
  StrategyEditorForDatabases_Base,
);
