import type { MetabaseCollection } from "embedding-sdk/types/collection";

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
};
