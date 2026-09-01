import _ from "underscore";

import { stringifyHashOptions } from "metabase/utils/browser";
import { isJWT } from "metabase/utils/jwt";
import { isUuid } from "metabase/utils/uuid";
import type {
  ActionDashboardCard,
  BaseDashboardCard,
  QuestionDashboardCard,
  SeriesCard,
  VirtualCard,
  VirtualDashboardCard,
} from "metabase-types/api";

export function isQuestionCard(
  card: SeriesCard | VirtualCard,
): card is SeriesCard {
  // Some old virtual cards have dataset_query equal to {} so we need to check for null and empty object
  return (
    card.dataset_query != null && Object.keys(card.dataset_query).length > 0
  );
}

export function isActionDashCard(
  dashcard: BaseDashboardCard,
): dashcard is ActionDashboardCard {
  return "action" in dashcard;
}

export function isVirtualDashCard(
  dashcard: Pick<BaseDashboardCard, "visualization_settings">,
): dashcard is VirtualDashboardCard {
  return _.isObject(dashcard?.visualization_settings?.virtual_card);
}

export function isQuestionDashCard(
  dashcard: BaseDashboardCard,
): dashcard is QuestionDashboardCard {
  return (
    "card_id" in dashcard &&
    "card" in dashcard &&
    !isVirtualDashCard(dashcard) &&
    !isActionDashCard(dashcard)
  );
}

export function isTransientId(id: unknown) {
  return typeof id === "string" && /\/auto\/dashboard/.test(id);
}

export const ADHOC_DASHBOARD_PATH = "/dashboard/adhoc";
export const ADHOC_DASHBOARD_HASH_KEY = "adhoc";

// An ad-hoc dashboard id is its own url: the adhoc path plus the definition as a
// `#adhoc=<encoded>` hash option, so DashboardApp's other hash options
// (`fullscreen`, `refresh`, …) can live alongside it.
export function getAdhocDashboardId(encodedDefinition: string) {
  return `${ADHOC_DASHBOARD_PATH}#${stringifyHashOptions({
    [ADHOC_DASHBOARD_HASH_KEY]: encodedDefinition,
  })}`;
}

export function isAdhocDashboardPath(pathname: string) {
  return pathname === ADHOC_DASHBOARD_PATH;
}

export function isAdhocDashboardId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(ADHOC_DASHBOARD_PATH);
}

export function getDashboardType(id: unknown) {
  if (id == null || typeof id === "object") {
    // HACK: support inline dashboards
    return "inline";
  } else if (isUuid(id)) {
    return "public";
  } else if (isJWT(id)) {
    return "embed";
  } else if (isTransientId(id)) {
    return "transient";
  } else if (isAdhocDashboardId(id)) {
    return "adhoc";
  } else {
    return "normal";
  }
}
