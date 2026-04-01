import type {
  MetabotInfo,
  UserMetabotPermissions,
  UserMetabotPermissionsResponse,
} from "../metabot";

export const createMockMetabotInfo = (
  opts?: Partial<MetabotInfo>,
): MetabotInfo => ({
  id: 1,
  name: "Metabot",
  entity_id: "metabot",
  description: "",
  use_verified_content: false,
  collection_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...opts,
});

export const createMockUserMetabotPermissions = (
  opts?: Partial<UserMetabotPermissions>,
): UserMetabotPermissionsResponse => ({
  permissions: {
    metabot: "yes",
    "metabot-sql-generation": "yes",
    "metabot-nql": "yes",
    "metabot-other-tools": "yes",
    ...opts,
  },
});
