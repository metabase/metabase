import _ from "underscore";
import type { DashboardOrderedCard } from "metabase-types/api";

export function isVirtualDashCard(dashcard: DashboardOrderedCard) {
  return _.isObject(dashcard?.visualization_settings?.virtual_card);
}
