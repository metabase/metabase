export const USER_STATUS = {
  active: "active",
  deactivated: "deactivated",
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
export const ACTIVE_USERS_NUDGE_THRESHOLD = 50;
