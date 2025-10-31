import { useEffect, useState } from "react";

import {
  useCreateCloudMigrationMutation,
  useGetCloudMigrationQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useStoreUrl } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { Box } from "metabase/ui";
import type { CloudMigration } from "metabase-types/api/cloud-migration";

import { MigrationCreationError } from "./MigrationCreationError";
import { MigrationError } from "./MigrationError";
import { MigrationInProgress } from "./MigrationInProgress";
import { MigrationStart } from "./MigrationStart";
import { MigrationSuccess } from "./MigrationSuccess";
import {
  type InternalCloudMigrationState,
  defaultGetPollingInterval,
  getStartedVisibleStates,
  isInProgressMigration,
  openCheckoutInNewTab,
} from "./utils";

interface CloudPanelProps {
  getPollingInterval?: (migration: CloudMigration) => number | undefined;
  onMigrationStart?: (checkoutUrl: string, migration: CloudMigration) => void;
}

export const CloudPanel = ({
  getPollingInterval = defaultGetPollingInterval,
  onMigrationStart = openCheckoutInNewTab,
}: CloudPanelProps) => {
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
      if (migration) {
        setPollingInterval(getPollingInterval(migration));
      }
    },
    [migration, getPollingInterval],
  );

  useEffect(
    function syncSiteSettings() {
      if (migrationState) {
        dispatch(refreshSiteSettings());
      }
    },
    [dispatch, migrationState],
  );

  const [createCloudMigration, createCloudMigrationResult] =
    useCreateCloudMigrationMutation();

  const checkoutUrl = useStoreUrl("checkout");

  const handleCreateMigration = async () => {
    const newMigration = await createCloudMigration().unwrap();
    await dispatch(refreshSiteSettings());
    onMigrationStart(checkoutUrl, newMigration);
  };

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      {getStartedVisibleStates.has(migrationState) && (
        <MigrationStart
          startNewMigration={handleCreateMigration}
          isStarting={createCloudMigrationResult.isLoading}
        />
      )}
      <Box>
        {migration && isInProgressMigration(migration) && (
          <MigrationInProgress
            migration={migration}
            checkoutUrl={checkoutUrl}
          />
        )}

        {migration && migrationState === "done" && (
          <MigrationSuccess
            migration={migration}
            restartMigration={handleCreateMigration}
            isRestarting={createCloudMigrationResult.isLoading}
            checkoutUrl={checkoutUrl}
          />
        )}

        {migration && migrationState === "error" && (
          <MigrationError migration={migration} />
        )}

        {createCloudMigrationResult.isError && (
          <MigrationCreationError error={createCloudMigrationResult.error} />
        )}
      </Box>
    </LoadingAndErrorWrapper>
  );
};
