import * as Urls from "metabase/lib/urls";

import { coerceCollectionId } from "metabase/collections/utils";

import type { Card, Dashboard } from "metabase-types/api";

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

function isCollectionPath(pathname: string): boolean {
  return pathname.startsWith("/collection");
}

function isUsersCollectionPath(pathname: string): boolean {
  return pathname.startsWith("/collection/users");
}

export function isQuestionPath(pathname: string): boolean {
  return pathname.startsWith("/question");
}

export function isModelPath(pathname: string): boolean {
  return pathname.startsWith("/model");
}

function isDashboardPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard");
}

function getSelectedItems({
  pathname,
  params,
  card,
  dashboard,
}: Opts): SelectedItem[] {
  const { slug } = params;

  if (isCollectionPath(pathname)) {
    return [
      {
        id: isUsersCollectionPath(pathname)
          ? "users"
          : Urls.extractCollectionId(slug),
        type: "collection",
      },
    ];
  }
  if (isDashboardPath(pathname) && dashboard) {
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
  if ((isQuestionPath(pathname) || isModelPath(pathname)) && card) {
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
  return [{ url: pathname, type: "non-entity" }];
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getSelectedItems;
