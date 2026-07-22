import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { rootId } from "metabase/admin/performance/constants/simple";
import type { UpdateTargetId } from "metabase/admin/performance/types";
import { FormProvider } from "metabase/forms";
import { Box, Stack } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { CacheConfig } from "metabase-types/api";

import { useResetToDefaultForm } from "../hooks/useResetToDefaultForm";

import { ResetButtonContainer } from "./ResetButtonContainer";
import { StrategyFormLauncher } from "./StrategyFormLauncher";
import S from "./StrategyFormLauncherPanel.module.css";

export const StrategyFormLauncherPanel = ({
  configs,
  targetId,
  updateTargetId,
  databases,
  isStrategyFormDirty,
  shouldShowResetButton,
}: {
  configs: CacheConfig[];
  targetId: number | null;
  updateTargetId: UpdateTargetId;
  databases: Database[];
  isStrategyFormDirty: boolean;
  shouldShowResetButton: boolean;
}) => {
  const databaseIds = useMemo(() => databases.map((db) => db.id), [databases]);

  const {
    handleSubmit: resetAllToDefault,
    versionNumber: resetFormVersionNumber,
  } = useResetToDefaultForm({
    databaseIds,
    isFormVisible: targetId !== null,
  });

  return (
    <Box
      component="section"
      role="group"
      h="100%"
      bg="background_page-secondary"
      className={S.root}
    >
      <Box className={cx(S.section, S.divided)}>
        <StrategyFormLauncher
          forId={rootId}
          title={t`Default policy`}
          configs={configs}
          targetId={targetId}
          updateTargetId={updateTargetId}
          isFormDirty={isStrategyFormDirty}
        />
      </Box>
      <Stack className={cx(S.section, S.stack)}>
        {databases?.map((db) => (
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
    </Box>
  );
};
