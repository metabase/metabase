import type { MetabaseCollection } from "embedding-sdk-bundle/types/collection";
import type { CardDisplayType } from "metabase-types/api";

import type { SdkEntityId } from "./entity-id";

export type SdkDashboardId = number | string | SdkEntityId;

/**
 * The Dashboard entity
 */
export type MetabaseDashboard = {
  id: SdkDashboardId;
  entity_id: SdkEntityId;
  created_at: string;
  updated_at: string;
  collection?: MetabaseCollection | null;
  name: string;
  description: string | null;
  "last-edit-info": {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    timestamp: string;
  };
};

/**
 * @inline
 */
export type DashboardEventHandlersProps = {
  /**
   * Callback that is called when the dashboard is loaded.
   */
  onLoad?: (dashboard: MetabaseDashboard | null) => void;

  /**
   * Callback that is called when the dashboard is loaded without cards.
   */
  onLoadWithoutCards?: (dashboard: MetabaseDashboard | null) => void;

  /**
   * A callback function that triggers when a question is opened from a dashboard card
   * or when the user changes the visualization type of a question.
   *
   * @param visualization the new visualization type
   */
  onVisualizationChange?: (visualization: CardDisplayType) => void;
};
