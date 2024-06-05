import { useMemo, type Dispatch, type SetStateAction } from "react";
import { t } from "ttag";

import { Panel } from "metabase/admin/performance/components/StrategyEditorForDatabases.styled";
import { rootId } from "metabase/admin/performance/constants/simple";
import type { UpdateTargetId } from "metabase/admin/performance/types";
import { FormProvider } from "metabase/forms";
import { color } from "metabase/lib/colors";
import { Box, Stack } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Config } from "metabase-types/api";

import { useResetToDefaultForm } from "../hooks/useResetToDefaultForm";

import { ResetButtonContainer } from "./ResetButtonContainer";
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
  const databaseIds = useMemo(() => databases.map(db => db.id), [databases]);

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
      <Box p="lg" style={{ borderBottom: "1px solid var(--mb-color-border)" }}>
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
