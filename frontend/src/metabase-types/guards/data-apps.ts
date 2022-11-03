import type {
  ActionDashboardCard,
  Dashboard,
  DataAppNavItem,
} from "metabase-types/api";

export function isActionDashboardCard(
  dashcard: unknown,
): dashcard is ActionDashboardCard {
  return "action" in (dashcard as ActionDashboardCard);
}

export function isNavItem(
  object: Dashboard | DataAppNavItem,
): object is DataAppNavItem {
  return "page_id" in object;
}
