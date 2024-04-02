import type { Dispatch, SetStateAction } from "react";
import { t } from "ttag";
import { findWhere } from "underscore";

import { FormProvider } from "metabase/forms";
import { color } from "metabase/lib/colors";
import { Box, Stack } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

import { rootId } from "../constants";
import { useResetToDefaultForm } from "../hooks/useResetToDefault";
import { Strategies, type Config, type SafelyUpdateTargetId } from "../types";

import { ResetButtonContainer } from "./ResetButtonContainer";
import { Panel } from "./StrategyEditorForDatabases.styled";
import { StrategyFormLauncher } from "./StrategyFormLauncher";

export const StrategyFormLauncherPanel = ({
  configs,
  setConfigs,
  targetId,
  safelyUpdateTargetId,
  databases,
  isStrategyFormDirty,
  shouldShowResetButton,
}: {
  configs: Config[];
  setConfigs: Dispatch<SetStateAction<Config[]>>;
  targetId: number | null;
  safelyUpdateTargetId: SafelyUpdateTargetId;
  databases: Database[];
  isStrategyFormDirty: boolean;
  shouldShowResetButton: boolean;
}) => {
  const databaseIds = databases.map(db => db.id);

  const {
    handleSubmit: resetAllToDefault,
    versionNumber: resetFormVersionNumber,
  } = useResetToDefaultForm({
    configs,
    setConfigs,
    databaseIds,
    isFormVisible: targetId !== null,
  });

  const rootConfig = findWhere(configs, { model_id: rootId });
  const rootConfigLabel =
    (rootConfig?.strategy.type
      ? Strategies[rootConfig?.strategy.type].shortLabel
      : null) ?? "default";

  return (
    <Panel role="group" style={{ backgroundColor: color("bg-light") }}>
      <Box p="lg" style={{ borderBottom: `1px solid ${color("border")}` }}>
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
      </Stack>
      <FormProvider
        initialValues={{}}
        onSubmit={resetAllToDefault}
        key={resetFormVersionNumber} // To avoid using stale context
      >
        {shouldShowResetButton && (
          <ResetButtonContainer rootConfigLabel={rootConfigLabel} />
        )}
      </FormProvider>
    </Panel>
  );
};
