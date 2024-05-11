import { useEffect, useState } from "react";
import { t } from "ttag";

import { useGetCloudMigrationQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { Box, Text } from "metabase/ui";

import { MigrationError } from "./MigrationError";
import { MigrationInProgress } from "./MigrationInProgress";
import { MigrationSuccess } from "./MigrationSuccess";
import { StepGetStarted } from "./StepGetStarted";
import type { InternalCloudMigrationState } from "./utils";
import {
  getStartedVisibleStates,
  isInProgressState,
  shouldPollStates,
} from "./utils";

// TODO: handle taking the user to store in a new tab
// https://www.figma.com/file/gDjo1m8C8aEHFtBNvhjp1p/Cloud-Migration?type=design&node-id=86-2816&mode=design&t=mR3Rwi2iJzBOVE4S-4
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

  const key = migration?.id;
  const migrationState: InternalCloudMigrationState =
    migration?.state ?? "uninitialized";
  const progress = migration?.progress ?? 0;

  useEffect(
    function syncPollingInterval() {
      const newPollingInterval = shouldPollStates.has(migrationState)
        ? // TODO: determine poll internval from a map,
          // we likely want to poll faster in the beginning, then more slowly later...
          1000
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
      <Box maw="30rem" key={key}>
        <Text fw="bold" size="1.5rem" mb="2rem">{t`Migrate to Cloud`}</Text>

        {getStartedVisibleStates.has(migrationState) && <StepGetStarted />}

        {/* TODO: test each of the progress states */}
        <Box mt="2rem">
          {migration && isInProgressState(migrationState) && (
            <MigrationInProgress progress={progress} state={migrationState} />
          )}

          {/* TODO: handle restarting a migration */}
          {migration && migrationState === "done" && (
            <MigrationSuccess
              migration={migration}
              restartMigration={() => {}}
            />
          )}

          {migration && migrationState === "error" && (
            <MigrationError migration={migration} />
          )}
        </Box>
      </Box>
    </LoadingAndErrorWrapper>
  );
};
