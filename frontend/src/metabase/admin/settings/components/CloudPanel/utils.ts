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

export const shouldPollStates = new Set<InternalCloudMigrationState>([
  "init",
  "setup",
  "dump",
  "upload",
]);

export const getMigrationEventTime = (isoString: string) =>
  dayjs(isoString).format("MMMM DD, YYYY, hh:mm A");
