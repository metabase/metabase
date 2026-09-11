import _ from "underscore";

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

export const ADHOC_DASHBOARD_PATH = "/dashboard";

// An ad-hoc dashboard id is its own url, `/dashboard#<encoded definition>`, like
// `/question#<hash>`. The definition is the first hash segment; DashboardApp's
// display options (`fullscreen`, `refresh`, …) append after `&` and round-trip
// through the hash-option helpers as a bare key.
export function getAdhocDashboardId(encodedDefinition: string) {
  return `${ADHOC_DASHBOARD_PATH}#${encodedDefinition}`;
}

export function getAdhocDashboardEncodedDefinition(hash: string) {
  const [encodedDefinition] = hash.replace(/^#/, "").split("&");
  return encodedDefinition || undefined;
}

export function isAdhocDashboardPath(pathname: string) {
  return pathname === ADHOC_DASHBOARD_PATH;
}

export function isAdhocDashboardId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(`${ADHOC_DASHBOARD_PATH}#`);
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
