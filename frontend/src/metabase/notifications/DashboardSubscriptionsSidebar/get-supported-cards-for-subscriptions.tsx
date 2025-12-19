import { isVisualizerDashboardCard } from "metabase/visualizer/utils";
import {
  type Card,
  type Dashboard,
  isVirtualCardDisplayType,
} from "metabase-types/api";

const cardsFromDashboard = (dashboard?: Dashboard) => {
  if (dashboard === undefined) {
    return [];
  }

  return dashboard.dashcards.map((card) => ({
    id: card.card.id,
    collection_id: card.card.collection_id,
    description: card.card.description,
    display: card.card.display,
    name: isVisualizerDashboardCard(card)
      ? card.visualization_settings.visualization.settings["card.title"]
      : card.card.name,
    include_csv: false,
    include_xls: false,
    dashboard_card_id: card.id,
    dashboard_id: dashboard.id,
    parameter_mappings: card.parameter_mappings,
    download_perms: card.card.download_perms,
  }));
};

export const getSupportedCardsForSubscriptions = (dashboard?: Dashboard) => {
  return cardsFromDashboard(dashboard).filter(
    (card: Pick<Card, "display">) => !isVirtualCardDisplayType(card.display),
  );
};
