import { useEffect, useState } from "react";
import { t } from "ttag";

import { useGetCloudMigrationQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { Box, Text } from "metabase/ui";
import type { CloudMigrationState } from "metabase-types/api/cloud-migration";

import { MigrationError } from "./MigrationError";
import { MigrationInProgress } from "./MigrationInProgress";
import { MigrationSuccess } from "./MigrationSuccess";
import { StepGetStarted } from "./StepGetStarted";

type InternalCloudMigrationState = CloudMigrationState | "uninitialized";
const getStartedVisibleStates = new Set<InternalCloudMigrationState>([
  "uninitialized",
  "init",
  "setup",
  "dump",
  "upload",
  "cancelled",
  "error",
]);

const shouldPollStates = new Set<InternalCloudMigrationState>([
  "init",
  "setup",
  "dump",
  "upload",
]);

export const CloudPanel = () => {
  const dispatch = useDispatch();
  const [pollingInterval, setPollingInterval] = useState<number | undefined>(
    undefined,
  );

  const {
    data: migration,
    isLoading,
    error,
  } = useGetCloudMigrationQuery(undefined, {
    refetchOnMountOrArgChange: true,
    pollingInterval,
  });

  const migrationState: InternalCloudMigrationState =
    migration?.state ?? "uninitialized";
  const progress = migration?.progress ?? 0;

  useEffect(
    function syncPollingInterval() {
      const newPollingInterval = shouldPollStates.has(migrationState)
        ? 1000
        : undefined;
      setPollingInterval(newPollingInterval);
    },
    [migrationState],
  );

  useEffect(
    function syncSiteSettings() {
      if (migrationState) {
        dispatch(refreshSiteSettings({}));
      }
    },
    [dispatch, migrationState],
  );

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      <Box maw="30rem">
        <Text fw="bold" size="1.5rem">{t`Migrate to Cloud`}</Text>

        {getStartedVisibleStates.has(migrationState) && <StepGetStarted />}

        {migration && migrationState === "error" && (
          <MigrationError mt="2rem" migration={migration} />
        )}

        {migration && migrationState === "setup" && (
          <MigrationInProgress progress={progress} mt="2rem" />
        )}

        {migration && migrationState === "done" && (
          <MigrationSuccess migration={migration} mt="2rem" />
        )}
      </Box>
    </LoadingAndErrorWrapper>
  );
};
