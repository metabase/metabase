import { useEffect, useState } from "react";

import {
  useCreateCloudMigrationMutation,
  useGetCloudMigrationQuery,
  useLazyGetSettingsQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useStoreUrl } from "metabase/common/hooks";
import { type Plan, getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
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
  onMigrationStart?: (
    storeUrl: string,
    plan: Plan,
    migration: CloudMigration,
  ) => void;
}

export const CloudPanel = ({
  getPollingInterval = defaultGetPollingInterval,
  onMigrationStart = openCheckoutInNewTab,
}: CloudPanelProps) => {
  const [refetchSiteSettings] = useLazyGetSettingsQuery();
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
        refetchSiteSettings();
      }
    },
    [refetchSiteSettings, migrationState],
  );

  const [createCloudMigration, createCloudMigrationResult] =
    useCreateCloudMigrationMutation();

  const storeUrl = useStoreUrl("checkout");
  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );

  const handleCreateMigration = async () => {
    // createCloudMigration invalidates session-properties, which refetches settings.
    const newMigration = await createCloudMigration().unwrap();
    onMigrationStart(storeUrl, plan, newMigration);
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
            storeUrl={storeUrl}
            plan={plan}
            migration={migration}
          />
        )}

        {migration && migrationState === "done" && (
          <MigrationSuccess
            storeUrl={storeUrl}
            plan={plan}
            migration={migration}
            restartMigration={handleCreateMigration}
            isRestarting={createCloudMigrationResult.isLoading}
          />
        )}

        {migration && migrationState === "error" && (
          <MigrationError
            migration={migration}
            restartMigration={handleCreateMigration}
            isRestarting={createCloudMigrationResult.isLoading}
          />
        )}

        {createCloudMigrationResult.isError && (
          <MigrationCreationError error={createCloudMigrationResult.error} />
        )}
      </Box>
    </LoadingAndErrorWrapper>
  );
};
