export type UserStatus = "active" | "deactivated";

export const USER_STATUS: Record<string, UserStatus> = {
  active: "active",
  deactivated: "deactivated",
};

export const ACTIVE_USERS_NUDGE_THRESHOLD = 50;
