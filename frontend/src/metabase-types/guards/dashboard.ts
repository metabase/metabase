import type {
  BaseDashboardCard,
  LinkEntity,
  RestrictedLinkEntity,
  VisualizerDashboardCard,
} from "metabase-types/api/dashboard";

export const isRestrictedLinkEntity = (
  value: LinkEntity,
): value is RestrictedLinkEntity =>
  !!(value as RestrictedLinkEntity)?.restricted;

export function isVisualizerDashboardCard(
  dashcard?: BaseDashboardCard,
): dashcard is VisualizerDashboardCard {
  if (!dashcard?.visualization_settings) {
    return false;
  }

  return dashcard.visualization_settings["visualization"] !== undefined;
}
