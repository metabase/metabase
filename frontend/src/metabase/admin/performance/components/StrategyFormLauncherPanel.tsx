import type { Dispatch, SetStateAction } from "react";
import { t } from "ttag";

import { FormProvider } from "metabase/forms";
import { color } from "metabase/lib/colors";
import { Box, Stack } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

import { rootId } from "../constants";
import { useResetToDefaultForm } from "../hooks/useResetToDefault";
import type { Config, UpdateTargetId } from "../types";

import { ResetButtonContainer } from "./ResetButtonContainer";
import { Panel } from "./StrategyEditorForDatabases.styled";
import { StrategyFormLauncher } from "./StrategyFormLauncher";

export const StrategyFormLauncherPanel = ({
  configs,
  setConfigs,
  targetId,
  updateTargetId,
  databases,
  isStrategyFormDirty,
  shouldShowResetButton,
}: {
  configs: Config[];
  setConfigs: Dispatch<SetStateAction<Config[]>>;
  targetId: number | null;
  updateTargetId: UpdateTargetId;
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

  return (
    <Panel role="group" style={{ backgroundColor: color("bg-light") }}>
      <Box p="lg" style={{ borderBottom: `1px solid ${color("border")}` }}>
        <StrategyFormLauncher
          forId={rootId}
          title={t`Default policy`}
          configs={configs}
          targetId={targetId}
          updateTargetId={updateTargetId}
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
            updateTargetId={updateTargetId}
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
        {shouldShowResetButton && <ResetButtonContainer />}
      </FormProvider>
    </Panel>
  );
};
