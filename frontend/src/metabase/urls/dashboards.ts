import slugg from "slugg";

import { isTransientCardId } from "metabase/common/utils/card";
import { stringifyHashOptions } from "metabase/utils/browser";
import { utf8_to_b64url } from "metabase/utils/encoding";
import MetabaseSettings from "metabase/utils/settings";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  DashCardId,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";

import { appendSlug } from "./utils";

type DashboardUrlBuilderOpts = {
  addCardWithId?: number;
  editMode?: boolean;
  tabId?: DashboardTabId | undefined;
  scrollToDashcard?: DashCardId | undefined;
};

export function dashboard(
  dashboard: {
    id: DashboardId;
    name?: string;
  },
  {
    addCardWithId,
    editMode,
    tabId,
    scrollToDashcard,
  }: DashboardUrlBuilderOpts = {},
) {
  // x-ray dashboards have ids as urls
  const path =
    typeof dashboard.id === "string"
      ? `${dashboard.id}`
      : `/dashboard/${appendSlug(dashboard.id, dashboard.name ? slugg(dashboard.name) : null)}`;

  const query = tabId
    ? new URLSearchParams({ tab: `${tabId}` }).toString()
    : "";

  const hash = stringifyHashOptions({
    ...(addCardWithId ? { add: addCardWithId } : {}),
    ...(editMode ? { edit: editMode } : {}),
    ...(scrollToDashcard ? { scrollTo: scrollToDashcard } : {}),
  });

  return `${path}${query ? "?" + query : ""}${hash ? "#" + hash : ""}`;
}

export function publicDashboard(uuid: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/dashboard/${uuid}`;
}

export function comparisonDashboard(
  question: Question,
  questionWithFilters: Question,
) {
  const questionId = question.id();
  const tableId = Lib.sourceTableOrCardId(question.query());
  const filterQuery = Lib.toLegacyQuery(questionWithFilters.query());
  const filter = filterQuery.type === "query" ? filterQuery.query.filter : null;
  const cellQuery = filter
    ? `/cell/${utf8_to_b64url(JSON.stringify(filter))}`
    : "";

  const query = question.datasetQuery();
  if (questionId != null && !isTransientCardId(questionId)) {
    return `auto/dashboard/question/${questionId}${cellQuery}/compare/table/${tableId}`;
  } else {
    const adHocQuery = utf8_to_b64url(JSON.stringify(query));
    return `auto/dashboard/adhoc/${adHocQuery}${cellQuery}/compare/table/${tableId}`;
  }
}

export function automaticDashboard(
  question: Question,
  questionWithFilters: Question,
) {
  const questionId = question.id();
  const filterQuery = Lib.toLegacyQuery(questionWithFilters.query());
  const filter = filterQuery.type === "query" ? filterQuery.query.filter : null;
  const cellQuery = filter
    ? `/cell/${utf8_to_b64url(JSON.stringify(filter))}`
    : "";

  const query = question.datasetQuery();
  if (questionId != null && !isTransientCardId(questionId)) {
    return `auto/dashboard/question/${questionId}${cellQuery}`;
  } else {
    const adHocQuery = utf8_to_b64url(JSON.stringify(query));
    return `auto/dashboard/adhoc/${adHocQuery}${cellQuery}`;
  }
}
