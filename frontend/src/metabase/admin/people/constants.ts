export type ActiveStatus = "active" | "deactivated";

export const ACTIVE_STATUS: Record<string, ActiveStatus> = {
  active: "active",
  deactivated: "deactivated",
};

export const ACTIVE_USERS_NUDGE_THRESHOLD = 50;
