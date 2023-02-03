import * as Urls from "metabase/lib/urls";

import { coerceCollectionId } from "metabase/collections/utils";

import type { Card, Dashboard } from "metabase-types/api";
import type Question from "metabase-lib/Question";

import { SelectedItem } from "./types";

type Opts = {
  pathname: string;
  params: {
    slug?: string;
    pageId?: string;
  };
  card?: Card;
  dashboard?: Dashboard;
};

const MODEL_DETAIL_PAGE_PATTERN = /\/model\/.*\/detail.*/;

export function isModelDetailPathname(pathname: string): boolean {
  return MODEL_DETAIL_PAGE_PATTERN.test(pathname);
}

function getSelectedItems({
  pathname,
  params,
  card,
  dashboard,
}: Opts): SelectedItem[] {
  const { slug } = params;

  const isCollectionPath = pathname.startsWith("/collection");
  const isUsersCollectionPath = pathname.startsWith("/collection/users");
  const isQuestionPath = pathname.startsWith("/question");
  const isModelPath = pathname.startsWith("/model");
  const isModelDetailPath = isModelDetailPathname(pathname);
  const isDashboardPath = pathname.startsWith("/dashboard");

  if (isCollectionPath) {
    return [
      {
        id: isUsersCollectionPath ? "users" : Urls.extractCollectionId(slug),
        type: "collection",
      },
    ];
  }
  if (isDashboardPath && dashboard) {
    return [
      {
        id: dashboard.id,
        type: "dashboard",
      },
      {
        id: coerceCollectionId(dashboard.collection_id),
        type: "collection",
      },
    ];
  }
  if ((isQuestionPath || isModelPath) && card) {
    return [
      {
        id: card.id,
        type: "card",
      },
      {
        id: coerceCollectionId(card.collection_id),
        type: "collection",
      },
    ];
  }
  if (isModelDetailPath) {
    return [
      {
        id: Urls.extractEntityId(slug),
        type: "card",
      },
    ];
  }
  return [{ url: pathname, type: "non-entity" }];
}

export default getSelectedItems;
