import { Collection, RegularCollectionId } from "./collection";
import { ClickBehavior } from "./click-behavior";
import {
  BaseDashboardOrderedCard,
  Dashboard,
  DashboardParameterMapping,
} from "./dashboard";
import { WritebackAction } from "./writeback";
import { ActionDisplayType } from "./writeback-form-settings";
import { Card } from "./card";

export type DataAppId = number;
export type DataAppPage = Dashboard;
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

export type ActionParametersMapping = Pick<
  DashboardParameterMapping,
  "parameter_id" | "target"
>;

export interface ActionDashboardCard
  extends Omit<BaseDashboardOrderedCard, "parameter_mappings"> {
  action?: WritebackAction;
  card_id?: number; // model card id for the associated action

  parameter_mappings?: ActionParametersMapping[] | null;
  visualization_settings: {
    [key: string]: unknown;
    "button.label"?: string;
    click_behavior?: ClickBehavior;
    actionDisplayType?: ActionDisplayType;
  };
}
