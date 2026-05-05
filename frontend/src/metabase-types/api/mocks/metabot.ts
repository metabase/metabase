import {
  AIToolKey,
  type MetabotGroupPermission,
  type MetabotInfo,
  type UserMetabotPermissions,
  type UserMetabotPermissionsResponse,
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
    "metabot-nlq": "yes",
    "metabot-other-tools": "yes",
    ...opts,
  },
});

export const createMockMetabotGroupPermission = (
  opts?: Partial<MetabotGroupPermission>,
): MetabotGroupPermission => ({
  group_id: 1,
  perm_type: AIToolKey.Metabot,
  perm_value: "yes",
  ...opts,
});

export const createMockMetabotGroupPermissions = (
  groupId: number,
  overrides?: Partial<Record<AIToolKey, "yes" | "no">>,
): MetabotGroupPermission[] => {
  const defaults: Record<AIToolKey, "yes" | "no"> = {
    [AIToolKey.Metabot]: "yes",
    [AIToolKey.ChatAndNLQ]: "yes",
    [AIToolKey.SQLGeneration]: "yes",
    [AIToolKey.OtherTools]: "yes",
    ...overrides,
  };

  return Object.entries(defaults).map(([permType, permValue]) => ({
    group_id: groupId,
    perm_type: permType as AIToolKey,
    perm_value: permValue,
  }));
};
