import type {
  BaseDashboardCard,
  Card,
  DashCardDataSeries,
  DashCardDataSeriesItem,
  DashCardSeries,
  DashCardSeriesItem,
  LinkEntity,
  RestrictedLinkEntity,
  VirtualCard,
  VisualizerDashboardCard,
  VisualizerDataSeries,
  VisualizerSeries,
  VisualizerSeriesItem,
} from "metabase-types/api";
import { isVirtualCardDisplayType } from "metabase-types/api";

export const isRestrictedLinkEntity = (
  value: LinkEntity,
): value is RestrictedLinkEntity =>
  // Unjustified type cast. FIXME
  !!(value as RestrictedLinkEntity)?.restricted;

export const isVisualizerDashboardCard = (
  dashcard?: BaseDashboardCard,
): dashcard is VisualizerDashboardCard => {
  if (!dashcard?.visualization_settings) {
    return false;
  }

  return dashcard.visualization_settings["visualization"] !== undefined;
};

export function isVirtualCard(card: Card | VirtualCard): card is VirtualCard {
  return isVirtualCardDisplayType(card.display);
}

export function isDashCardDataSeriesItem(
  item: DashCardSeriesItem,
): item is DashCardDataSeriesItem {
  return (
    !isVirtualCard(item.card) &&
    item.data != null &&
    item.database_id != null &&
    item.row_count != null &&
    item.running_time != null
  );
}

export function isDashCardDataSeries(
  series: DashCardSeries,
): series is DashCardDataSeries {
  return series.every(isDashCardDataSeriesItem);
}

export function isVisualizerSeriesItem(
  item: DashCardSeriesItem | VisualizerSeriesItem,
): item is VisualizerSeriesItem {
  return "_isVisualizer" in item && item._isVisualizer;
}

export function isVisualizerDataSeries(
  series: VisualizerSeries,
): series is VisualizerDataSeries {
  return series.every((item) => item.data != null);
}
