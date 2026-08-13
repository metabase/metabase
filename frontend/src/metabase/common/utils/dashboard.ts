import type {
  DashboardCard,
  DashboardCardLayoutAttrs,
  VirtualCard,
  VirtualCardDisplay,
} from "metabase-types/api";

export const DASHBOARD_NAME_MAX_LENGTH = 254;
export const DASHBOARD_DESCRIPTION_MAX_LENGTH = 1500;

let tempId = -1;

export function generateTemporaryDashcardId() {
  return tempId--;
}

export type NewDashboardCard = Omit<
  DashboardCard,
  "entity_id" | "created_at" | "updated_at"
>;

type MandatoryDashboardCardAttrs = Pick<
  DashboardCard,
  "dashboard_id" | "card"
> &
  DashboardCardLayoutAttrs;

export function createDashCard(
  attrs: Partial<NewDashboardCard> & MandatoryDashboardCardAttrs,
): NewDashboardCard {
  return {
    id: generateTemporaryDashcardId(),
    dashboard_tab_id: null,
    card_id: null,
    parameter_mappings: [],
    visualization_settings: {},
    ...attrs,
  };
}

export function createVirtualCard(display: VirtualCardDisplay): VirtualCard {
  return {
    name: null,
    display,
    visualization_settings: {},
    archived: false,
  };
}
