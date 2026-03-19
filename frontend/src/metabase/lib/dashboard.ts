import _ from "underscore";

import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import type {
  ActionDashboardCard,
  BaseDashboardCard,
  Card,
  QuestionDashboardCard,
  VirtualCard,
  VirtualDashboardCard,
} from "metabase-types/api";

export function isQuestionCard(card: Card | VirtualCard) {
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
  } else {
    return "normal";
  }
}
