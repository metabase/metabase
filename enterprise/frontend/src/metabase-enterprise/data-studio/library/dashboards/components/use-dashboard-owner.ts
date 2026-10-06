import { useState } from "react";

import type { Dashboard, UserId } from "metabase-types/api";

export type DashboardOwner = {
  userId: UserId | null;
  email: string | null;
};

/*
 * PROTOTYPE: dashboards have no owner field and the API can't change the
 * creator, so the chosen owner lives in this browser's localStorage. Until one
 * is chosen, the owner is the dashboard's creator.
 */
const getStorageKey = (dashboardId: Dashboard["id"]) =>
  `metabase-prototype:library-dashboard-owner:${dashboardId}`;

function readStoredOwner(dashboardId: Dashboard["id"]): DashboardOwner | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(getStorageKey(dashboardId)) ?? "null",
    );
    if (typeof value !== "object" || value == null) {
      return null;
    }
    const userId = "userId" in value ? value.userId : null;
    const email = "email" in value ? value.email : null;
    return {
      userId: typeof userId === "number" ? userId : null,
      email: typeof email === "string" ? email : null,
    };
  } catch {
    return null;
  }
}

export function useDashboardOwner(dashboard: Dashboard) {
  const [storedOwner, setStoredOwner] = useState(() =>
    readStoredOwner(dashboard.id),
  );

  const owner: DashboardOwner = storedOwner ?? {
    userId: dashboard.creator_id ?? null,
    email: null,
  };

  const setOwner = (newOwner: DashboardOwner) => {
    localStorage.setItem(getStorageKey(dashboard.id), JSON.stringify(newOwner));
    setStoredOwner(newOwner);
  };

  return [owner, setOwner] as const;
}
