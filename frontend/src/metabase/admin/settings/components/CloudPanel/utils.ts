import dayjs from "dayjs";

import type {
  CloudMigration,
  CloudMigrationState,
} from "metabase-types/api/cloud-migration";

export type InternalCloudMigrationState = CloudMigrationState | "uninitialized";
export type InProgressStates = "init" | "setup" | "dump" | "upload";
export type InProgressCloudMigration = Omit<CloudMigration, "state"> & {
  state: InProgressStates;
};

export const getStartedVisibleStates = new Set<InternalCloudMigrationState>([
  "uninitialized",
  "cancelled",
  "error",
]);

export const progressStates = new Set<InternalCloudMigrationState>([
  "init",
  "setup",
  "dump",
  "upload",
]);

export const isInProgressState = (
  state: InternalCloudMigrationState,
): state is InProgressStates => {
  return progressStates.has(state);
};

export const isInProgressMigration = (
  migration: CloudMigration,
): migration is InProgressCloudMigration => {
  return isInProgressState(migration.state);
};

const SECOND = 1000;

const defaultPollingIntervalsByState: Record<
  InternalCloudMigrationState,
  number | undefined
> = {
  uninitialized: undefined,
  init: 1 * SECOND,
  setup: 1 * SECOND,
  dump: 3 * SECOND,
  upload: 3 * SECOND,
  cancelled: undefined,
  error: undefined,
  done: undefined,
};

export const defaultGetPollingInterval = (
  migration: CloudMigration,
): number | undefined => {
  const { progress, state } = migration;
  const defaultPollingInterval = defaultPollingIntervalsByState[state];
  const isAlmostDone = progress > 90 && progress < 100;

  if (isAlmostDone) {
    return 1 * SECOND;
  }

  return defaultPollingInterval;
};

export const getMigrationEventTime = (isoString: string) =>
  dayjs(isoString).format("MMMM DD, YYYY, hh:mm A");

export const openCheckoutInNewTab = (
  storeUrl: string,
  migration: CloudMigration,
) => {
  window
    .open(
      `${storeUrl}/checkout?migration-id=${migration.external_id}`,
      "_blank",
    )
    ?.focus();
};
