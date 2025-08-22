import type {
  MetabaseCollection,
  SdkCollectionId,
} from "embedding-sdk-bundle/types/collection";
import type { CreateDashboardProperties } from "metabase/dashboard/containers/CreateDashboardForm";

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
