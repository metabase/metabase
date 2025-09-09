import type { Location } from "history";
import _ from "underscore";

import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import type {
  CacheableDashboard,
  Card,
  Dashboard,
  Database,
  ParameterId,
} from "metabase-types/api";
import type { SelectedTabId } from "metabase-types/store";

import { expandInlineCard } from "./card-utils";
import { findDashCardForInlineParameter } from "./dashcard-utils";

// This adds default properties and placeholder IDs for an inline dashboard
export function expandInlineDashboard(dashboard: Partial<Dashboard>) {
  return {
    name: "",
    parameters: [],
    ...dashboard,
    dashcards: dashboard.dashcards?.map((dashcard) => ({
      visualization_settings: {},
      parameter_mappings: [],
      ...dashcard,
      id: _.uniqueId("dashcard"),
      card: expandInlineCard(dashcard?.card),
      series: ((dashcard as any).series || []).map((card: Card) =>
        expandInlineCard(card),
      ),
    })),
  };
}

export function getInlineParameterTabMap(dashboard: Dashboard) {
  const { dashcards = [] } = dashboard;
  const parameters = dashboard.parameters ?? [];

  const result: Record<ParameterId, SelectedTabId> = {};

  parameters.forEach((parameter) => {
    const parentDashcard = findDashCardForInlineParameter(
      parameter.id,
      dashcards,
    );
    if (parentDashcard) {
      result[parameter.id] = parentDashcard.dashboard_tab_id ?? null;
    }
  });

  return result;
}

export function getAllDashboardCards(dashboard: Dashboard) {
  const results = [];
  for (const dashcard of dashboard.dashcards) {
    const cards = [dashcard.card].concat((dashcard as any).series || []);
    results.push(...cards.map((card) => ({ card, dashcard })));
  }
  return results;
}

export function getCurrentTabDashboardCards(
  dashboard: Dashboard,
  selectedTabId: SelectedTabId,
) {
  return getAllDashboardCards(dashboard).filter(
    ({ dashcard }) =>
      (dashcard.dashboard_tab_id == null && selectedTabId == null) ||
      dashcard.dashboard_tab_id === selectedTabId,
  );
}

export function hasDatabaseActionsEnabled(database: Database) {
  return database.settings?.["database-enable-actions"] ?? false;
}

export function isTransientId(id: unknown) {
  return typeof id === "string" && /\/auto\/dashboard/.test(id);
}

export function getDashboardType(id: unknown) {
  if (id == null || typeof id === "object") {
    // HACK: support inline dashboards
    return "inline";
  } else if (isUuid(id)) {
    return "public";
  } else if (isJWT(id)) {
    return "embed";
  } else if (isTransientId(id)) {
    return "transient";
  } else {
    return "normal";
  }
}

export const isDashboardCacheable = (
  dashboard: Dashboard,
): dashboard is CacheableDashboard => typeof dashboard.id !== "string";

export function parseTabSlug(location: Location) {
  const slug = location.query?.tab;
  if (typeof slug === "string" && slug.length > 0) {
    const id = parseInt(slug, 10);
    return Number.isSafeInteger(id) ? id : null;
  }
  return null;
}

export function createTabSlug({
  id,
  name,
}: {
  id: SelectedTabId;
  name: string | undefined;
}) {
  if (id === null || id < 0 || !name) {
    return "";
  }
  return [id, ...name.toLowerCase().split(" ")].join("-");
}
