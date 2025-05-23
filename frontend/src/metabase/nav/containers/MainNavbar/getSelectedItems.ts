import { coerceCollectionId } from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls";
import type Question from "metabase-lib/v1/Question";
import type { Collection, Dashboard } from "metabase-types/api";

import type { SelectedItem } from "./types";

type Opts = {
  pathname: string;
  params: {
    slug?: string;
    pageId?: string;
  };
  question?: Question;
  dashboard?: Dashboard;
  collection?: Collection;
};

export function isCollectionPath(pathname: string): boolean {
  return (
    pathname.startsWith("/collection") &&
    // `/${resource}/entity/${entity_id}` paths should only do a redirect, without triggering any other logic
    !pathname.startsWith("/collection/entity/")
  );
}

function isTrashPath(pathname: string): boolean {
  return pathname.startsWith("/trash");
}

function isInTrash({
  pathname,
  collection,
  question,
  dashboard,
}: Pick<Opts, "pathname" | "collection" | "question" | "dashboard">): boolean {
  return (
    isTrashPath(pathname) ||
    collection?.archived ||
    question?.isArchived() ||
    dashboard?.archived ||
    false
  );
}

function isUsersCollectionPath(pathname: string): boolean {
  return pathname.startsWith("/collection/users");
}

export function isQuestionPath(pathname: string): boolean {
  return (
    pathname.startsWith("/question") &&
    // `/${resource}/entity/${entity_id}` paths should only do a redirect, without triggering any other logic
    !pathname.startsWith("/question/entity/")
  );
}

export function isModelPath(pathname: string): boolean {
  return pathname.startsWith("/model");
}

export function isMetricPath(pathname: string): boolean {
  return pathname.startsWith("/metric");
}

function isDashboardPath(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") &&
    // `/${resource}/entity/${entity_id}` paths should only do a redirect, without triggering any other logic
    !pathname.startsWith("/dashboard/entity/")
  );
}

function getSelectedItems({
  pathname,
  params,
  question,
  dashboard,
  collection,
}: Opts): SelectedItem[] {
  const { slug } = params;

  if (isInTrash({ pathname, collection, question, dashboard })) {
    return [
      {
        id: "trash",
        type: "collection",
      },
    ];
  }
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
  if ((isQuestionPath(pathname) || isModelPath(pathname)) && question) {
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
  return [{ url: pathname, type: "non-entity" }];
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getSelectedItems;
