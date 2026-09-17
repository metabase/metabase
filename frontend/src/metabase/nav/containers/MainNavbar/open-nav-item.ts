import { modelIconMap } from "metabase/common/utils/icon";
import type { StoreDashboard } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import { isMetricPath, isModelPath, isQuestionPath } from "./getSelectedItems";
import type { OpenNavItem } from "./types";

type Opts = {
  pathname: string;
  card?: Card;
  dashboard?: StoreDashboard;
};

/**
 * The thing the current route has open, as a rail row. Collections are deliberately excluded:
 * browsing a collection is not opening a piece of work, and the collections drawer already covers
 * getting to them.
 */
export function getOpenNavItem({
  pathname,
  card,
  dashboard,
}: Opts): OpenNavItem | null {
  if (card && !card.archived && isCardPath(pathname)) {
    return {
      key: `card-${card.id}`,
      name: card.name,
      url: getCardUrl(card),
      icon: modelIconMap[card.type === "question" ? "card" : card.type],
    };
  }

  if (dashboard && !dashboard.archived && isDashboardPath(pathname)) {
    return {
      key: `dashboard-${dashboard.id}`,
      name: dashboard.name,
      url: Urls.dashboard(dashboard),
      icon: modelIconMap.dashboard,
    };
  }

  return null;
}

function isCardPath(pathname: string) {
  return (
    isQuestionPath(pathname) || isModelPath(pathname) || isMetricPath(pathname)
  );
}

function isDashboardPath(pathname: string) {
  return pathname.startsWith("/dashboard");
}

function getCardUrl(card: Card) {
  switch (card.type) {
    case "model":
      return Urls.model(card);
    case "metric":
      return Urls.metric(card);
    default:
      return Urls.question(new Question(card));
  }
}
