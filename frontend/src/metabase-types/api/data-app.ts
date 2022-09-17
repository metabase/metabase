import { Collection, RegularCollectionId } from "./collection";
import { ClickBehavior } from "./click-behavior";
import {
  BaseDashboardOrderedCard,
  Dashboard,
  DashboardParameterMapping,
} from "./dashboard";
import { WritebackAction } from "./writeback";

export type DataAppId = number;
export type DataAppPageId = Dashboard["id"];

export interface DataAppNavItem {
  page_id: DataAppPageId;
  indent?: number;
  hidden?: boolean;
}

export interface DataApp {
  id: DataAppId;

  collection_id: number;
  dashboard_id: number | null; // homepage
  collection: Collection;

  options: Record<string, unknown> | null;
  nav_items: DataAppNavItem[];

  created_at: string;
  updated_at: string;
}

export interface DataAppSearchItem {
  id: RegularCollectionId;
  app_id: DataAppId;
  collection: Collection;
}

export type ActionButtonParametersMapping = Pick<
  DashboardParameterMapping,
  "parameter_id" | "target"
>;

export interface ActionButtonDashboardCard
  extends Omit<BaseDashboardOrderedCard, "parameter_mappings"> {
  action_id: number | null;
  action?: WritebackAction;

  parameter_mappings?: ActionButtonParametersMapping[] | null;
  visualization_settings: {
    [key: string]: unknown;
    "button.label"?: string;
    click_behavior?: ClickBehavior;
  };
}
