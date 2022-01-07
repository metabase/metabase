import { Properties } from "metabase-types/api";

export const createMockProperties = (
  opts?: Partial<Properties>,
): Properties => ({
  "enable-xrays": false,
  "enable-public-sharing": false,
  "show-database-syncing-modal": false,
  "show-homepage-data": false,
  "show-homepage-xrays": false,
  "show-homepage-pin-message": false,
  "slack-token": undefined,
  "slack-app-token": undefined,
  ...opts,
});
