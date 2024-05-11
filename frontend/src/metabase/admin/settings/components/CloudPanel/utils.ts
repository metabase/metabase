import dayjs from "dayjs";

import type { CloudMigrationState } from "metabase-types/api/cloud-migration";

export type InternalCloudMigrationState = CloudMigrationState | "uninitialized";
export type InProgressStates = "init" | "setup" | "dump" | "upload";

export const getStartedVisibleStates = new Set<InternalCloudMigrationState>([
  "uninitialized",
  "cancelled",
  "error",
]);

export const progressStates = new Set<InProgressStates>([
  "init",
  "setup",
  "dump",
  "upload",
]);

export const isInProgressState = (
  state: InternalCloudMigrationState,
): state is InProgressStates => progressStates.has(state);

const SECOND = 1000;

export const pollingIntervalsByState: Record<
  InternalCloudMigrationState,
  number | undefined
> = {
  init: 1 * SECOND,
  setup: 1 * SECOND,
  dump: 5 * SECOND,
  upload: 5 * SECOND,
};

export const getMigrationEventTime = (isoString: string) =>
  dayjs(isoString).format("MMMM DD, YYYY, hh:mm A");
