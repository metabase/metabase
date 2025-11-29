import type {
  MetabaseCollection,
  SdkCollectionId,
} from "embedding-sdk-bundle/types/collection";
import type { CreateDashboardProperties } from "metabase/dashboard/containers/CreateDashboardForm";
import type { CardDisplayType } from "metabase-types/api";

import type { SdkEntityId, SdkEntityToken } from "./entity";

export type SdkDashboardId = number | string | SdkEntityId;

export type SdkDashboardEntityPublicProps =
  | {
      /**
       * The ID of the dashboard.
       *  <br/>
       * This is either:
       *  <br/>
       *  - the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`
       *  <br/>
       *  - the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data
       */
      dashboardId: SdkDashboardId | null;
      token?: never;
    }
  | {
      dashboardId?: never;
      /**
       * A valid JWT token for the guest embed.
       */
      token: SdkEntityToken | null;
    };

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

/**
 * @interface
 * @category useCreateDashboardApi
 */
export type CreateDashboardValues = Omit<
  CreateDashboardProperties,
  "collection_id"
> & {
  /**
   * Collection in which to create a new dashboard. You can use predefined system values like `root` or `personal`.
   */
  collectionId: SdkCollectionId;
};
