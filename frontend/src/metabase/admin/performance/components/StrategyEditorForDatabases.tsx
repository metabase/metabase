import { useCallback, useEffect, useRef, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import { findWhere, pick } from "underscore";
import type { SchemaObjectDescription } from "yup/lib/schema";

import { useDatabaseListQuery } from "metabase/common/hooks";
import { LeaveConfirmationModalContent } from "metabase/components/LeaveConfirmationModal";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Modal from "metabase/components/Modal";
import { color } from "metabase/lib/colors";
import { PLUGIN_CACHING } from "metabase/plugins";
import { CacheConfigApi } from "metabase/services";
import { Box, Stack } from "metabase/ui";

import { rootId } from "../constants";
import { useDelayedLoadingSpinner } from "../hooks/useDelayedLoadingSpinner";
import type {
  StrategyType,
  type Config,
  type LeaveConfirmationData,
  type SafelyUpdateTargetId,
  type Strat,
} from "../types";
import { Strategies } from "../types";

import { ResetAllToDefaultButton } from "./ResetAllToDefaultButton";
import { Panel, TabWrapper } from "./StrategyEditorForDatabases.styled";
import { StrategyForm } from "./StrategyForm";
import { StrategyFormLauncher } from "./StrategyFormLauncher";

export const StrategyEditorForDatabases = ({
  canOverrideRootCacheInvalidationStrategy,
}: {
  canOverrideRootCacheInvalidationStrategy: boolean;
}) => {
  const [
    // The targetId is the id of the model that is currently being edited
    targetId,
    setTargetId,
  ] = useState<number | null>(null);

  const databasesResult = useDatabaseListQuery();
  const databases = databasesResult.data;

  const shouldShowStrategyFormLaunchers =
    canOverrideRootCacheInvalidationStrategy;

  const configsResult = useAsync(async () => {
    const lists = [CacheConfigApi.list({ model: "root" })];
    if (canOverrideRootCacheInvalidationStrategy) {
      lists.push(CacheConfigApi.list({ model: "database" }));
    }
    const [rootConfigsFromAPI, savedConfigsFromAPI] = await Promise.all(lists);
    const rootConfig = rootConfigsFromAPI?.data?.[0] ?? {
      model: "root",
      model_id: rootId,
      strategy: { type: "nocache" },
    };
    const configs = [rootConfig];
    configs.push(...(savedConfigsFromAPI?.data ?? []));
    return configs;
  }, []);

  const configsFromAPI = configsResult.value;

  const [configs, setConfigs] = useState<Config[]>([]);

  const rootConfigOverriddenOnce = configs.some(
    config => config.model_id !== rootId,
  );

  useEffect(() => {
    if (configsFromAPI) {
      setConfigs(configsFromAPI);
    }
  }, [configsFromAPI]);

  /** The config for the model currently being edited */
  const targetConfig = findWhere(configs, { model_id: targetId ?? undefined });
  const savedStrategy = targetConfig?.strategy;

  if (savedStrategy?.type === "duration") {
    savedStrategy.unit = "hours";
  }

  const [confirmation, setConfirmation] = useState<LeaveConfirmationData>({
    isModalOpen: false,
  });
  const [isStrategyFormDirty, setIsStrategyFormDirty] = useState(false);
  const showStrategyForm = targetId !== null;

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
      setConfirmation({ isModalOpen: true, onConfirm: update });
    } else {
      update();
    }
  };

  useEffect(() => {
    if (!canOverrideRootCacheInvalidationStrategy && targetId === null) {
      setTargetId(rootId);
    }
  }, [canOverrideRootCacheInvalidationStrategy, targetId]);

  const saveStrategy = useCallback(
    async (values: Strat) => {
      if (targetId === null) {
        return;
      }

      const baseConfig: Pick<Config, "model" | "model_id"> = {
        model: targetId === rootId ? "root" : "database",
        model_id: targetId,
      };

      const otherConfigs = configs.filter(
        config => config.model_id !== targetId,
      );
      if (values.type === "inherit") {
        await CacheConfigApi.delete(baseConfig, { hasBody: true }).then(() => {
          setConfigs(otherConfigs);
        });
      } else {
        const validFields = getFieldsForStrategyType(values.type);
        const newStrategy = pick(values, validFields) as Strat;
        const validatedStrategy =
          Strategies[values.type].validateWith.validateSync(newStrategy);

        const newConfig = {
          ...baseConfig,
          strategy: validatedStrategy,
        };

        await CacheConfigApi.update(newConfig).then(() => {
          setConfigs([...otherConfigs, newConfig]);
        });
      }
    },
    [configs, targetId],
  );
  const formPanelRef = useRef<HTMLDivElement>(null);
  const [formPanelHasVerticalScrollbar, setFormPanelHasVerticalScrollbar] =
    useState(false);

  useEffect(() => {
    const formPanel = formPanelRef.current;
    if (!formPanel) {
      return;
    }
    setFormPanelHasVerticalScrollbar(
      formPanel.scrollHeight > formPanel.clientHeight,
    );
  }, [
    formPanelRef.current?.scrollHeight,
    formPanelRef.current?.clientHeight,
    formPanelRef,
    setFormPanelHasVerticalScrollbar,
  ]);

  const showLoadingSpinner = useDelayedLoadingSpinner();
  const error = databasesResult.error || configsResult.error;
  const loading = databasesResult.isLoading || configsResult.loading;

  if (error || loading) {
    return showLoadingSpinner ? (
      <LoadingAndErrorWrapper error={error} loading={loading} />
    ) : (
      <></>
    );
  }

  return (
    <TabWrapper role="region" aria-label="Data caching settings">
      <Stack spacing="xl" lh="1.5rem" maw="32rem" mb="1.5rem">
        <aside>{PLUGIN_CACHING.explanation}</aside>
      </Stack>
      <Modal isOpen={confirmation.isModalOpen}>
        <LeaveConfirmationModalContent
          onAction={
            confirmation.isModalOpen ? confirmation.onConfirm : undefined
          }
          onClose={() => setConfirmation({ isModalOpen: false })}
        />
      </Modal>
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
          <Panel role="group" style={{ backgroundColor: color("bg-light") }}>
            <Box
              p="lg"
              style={{ borderBottom: `1px solid ${color("border")}` }}
            >
              <StrategyFormLauncher
                forId={rootId}
                title={t`Default policy`}
                configs={configs}
                targetId={targetId}
                safelyUpdateTargetId={safelyUpdateTargetId}
                isFormDirty={isStrategyFormDirty}
              />
            </Box>
            <Stack p="lg" spacing="md">
              {databases?.map(db => (
                <StrategyFormLauncher
                  forId={db.id}
                  title={db.name}
                  configs={configs}
                  targetId={targetId}
                  safelyUpdateTargetId={safelyUpdateTargetId}
                  isFormDirty={isStrategyFormDirty}
                  key={`database_${db.id}`}
                />
              ))}
              {rootConfigOverriddenOnce && (
                <ResetAllToDefaultButton
                  configs={configs}
                  setConfigs={setConfigs}
                />
              )}
            </Stack>
          </Panel>
        )}
        <Panel
          ref={formPanelRef}
          hasVerticalScrollbar={formPanelHasVerticalScrollbar}
        >
          {showStrategyForm && (
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

const getFieldsForStrategyType = (strategyType: StrategyType) => {
  const strategy = Strategies[strategyType];
  const validationSchemaDescription =
    strategy.validateWith.describe() as SchemaObjectDescription;
  const fieldRecord = validationSchemaDescription.fields;
  const fields = Object.keys(fieldRecord);
  return fields;
};
