import { isVisualizerDashboardCard } from "metabase/visualizer/utils";
import type {
  ActionParametersMapping,
  Card,
  Dashboard,
  DashboardId,
  DashboardParameterMapping,
  VirtualDashCardParameterMapping,
} from "metabase-types/api";
import { isVirtualCardDisplayType } from "metabase-types/api";

export type SubscriptionCard = Partial<
  Pick<Card, "id" | "collection_id" | "description" | "name">
> &
  Pick<Card, "display"> & {
    include_csv: boolean;
    include_xls: boolean;
    dashboard_card_id: number;
    dashboard_id: DashboardId;
    parameter_mappings:
      | DashboardParameterMapping[]
      | ActionParametersMapping[]
      | VirtualDashCardParameterMapping[]
      | null
      | undefined;
  };

const cardsFromDashboard = (dashboard?: Dashboard): SubscriptionCard[] => {
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
  }));
};

export const getSupportedCardsForSubscriptions = (
  dashboard?: Dashboard,
): SubscriptionCard[] => {
  return cardsFromDashboard(dashboard).filter(
    (card) => !isVirtualCardDisplayType(card.display),
  );
};
