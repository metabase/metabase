import {
  AIToolKey,
  type MetabotConversation,
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

export const createMockMetabotConversation = (
  opts?: Partial<MetabotConversation>,
): MetabotConversation => ({
  conversation_id: "00000000-0000-0000-0000-000000000000",
  created_at: new Date().toISOString(),
  title: null,
  user_id: 1,
  profile_id: null,
  message_count: 1,
  last_message_at: new Date().toISOString(),
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
    // Unjustified type cast. FIXME
    perm_type: permType as AIToolKey,
    perm_value: permValue,
  }));
};
