import * as Urls from "metabase/lib/urls";

import { coerceCollectionId } from "metabase/collections/utils";

import type { Dashboard } from "metabase-types/api";
import type Question from "metabase-lib/Question";

import { SelectedItem } from "./types";

type Opts = {
  pathname: string;
  params: {
    slug?: string;
    pageId?: string;
  };
  question?: Question;
  dashboard?: Dashboard;
};

function getSelectedItems({
  pathname,
  params,
  question,
  dashboard,
}: Opts): SelectedItem[] {
  const { slug } = params;

  const isCollectionPath = pathname.startsWith("/collection");
  const isUsersCollectionPath = pathname.startsWith("/collection/users");
  const isQuestionPath = pathname.startsWith("/question");
  const isModelPath = pathname.startsWith("/model");
  const isModelDetailPath = isModelPath && pathname.endsWith("/detail");
  const isDataAppPath = Urls.isDataAppPath(pathname);
  const isDataAppPagePath = Urls.isDataAppPagePath(pathname);
  const isDashboardPath = pathname.startsWith("/dashboard");

  if (isCollectionPath) {
    return [
      {
        id: isUsersCollectionPath ? "users" : Urls.extractCollectionId(slug),
        type: "collection",
      },
    ];
  }
  if (isDataAppPagePath) {
    return [
      {
        id: parseInt(params.pageId as string),
        type: "data-app-page",
      },
    ];
  }
  if (isDataAppPath) {
    return [
      {
        id: Urls.extractEntityId(slug),
        type: "data-app",
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
  if ((isQuestionPath || isModelPath) && question) {
    return [
      {
        id: question.id(),
        type: "card",
      },
      {
        id: coerceCollectionId(question.collectionId()),
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
