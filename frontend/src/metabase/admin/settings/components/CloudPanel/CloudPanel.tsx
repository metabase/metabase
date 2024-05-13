import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  useGetCloudMigrationQuery,
  useCreateCloudMigrationMutation,
} from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { Box, Text } from "metabase/ui";

import { MigrationError } from "./MigrationError";
import { MigrationInProgress } from "./MigrationInProgress";
import { MigrationStart } from "./MigrationStart";
import { MigrationSuccess } from "./MigrationSuccess";
import {
  type InternalCloudMigrationState,
  getCheckoutUrl,
  isInProgressMigration,
} from "./utils";
import { getStartedVisibleStates, pollingIntervalsByState } from "./utils";

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

  useEffect(
    function syncPollingInterval() {
      setPollingInterval(pollingIntervalsByState[migrationState]);
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

  const [createCloudMigration] = useCreateCloudMigrationMutation();

  const handleCreateMigration = async () => {
    const migration = await createCloudMigration().unwrap();
    await dispatch(refreshSiteSettings({}));
    window.open(getCheckoutUrl(migration), "_blank")?.focus();
  };

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      <Box maw="30rem" key={migration?.id}>
        <Text fw="bold" size="1.5rem" mb="2rem">{t`Migrate to Cloud`}</Text>

        {getStartedVisibleStates.has(migrationState) && (
          <MigrationStart startNewMigration={handleCreateMigration} />
        )}

        <Box mt="2rem">
          {migration && isInProgressMigration(migration) && (
            <MigrationInProgress migration={migration} />
          )}

          {migration && migrationState === "done" && (
            <MigrationSuccess
              migration={migration}
              restartMigration={handleCreateMigration}
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
