import { coerceCollectionId } from "metabase/common/collections/utils";
import type { StoreDashboard } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";
import type { Collection, SearchModel, Table } from "metabase-types/api";

import type { SelectedItem } from "./types";

type Opts = {
  pathname: string;
  params: {
    slug?: string;
  };
  question?: Question;
  dashboard?: StoreDashboard;
  collection?: Collection;
  /** The published table an ad-hoc `/question#…` route is reading, if any. */
  table?: Table;
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

export function getSelectedItems({
  pathname,
  params,
  question,
  dashboard,
  collection,
  table,
}: Opts): SelectedItem[] {
  const { slug } = params;

  // A published table opens as an ad-hoc question, so there is no card to key off — the table
  // itself is what the Official rail has a row for.
  if (table) {
    return [
      {
        id: table.id,
        type: "table",
        model: "table",
      },
      {
        id: coerceCollectionId(table.collection_id),
        type: "collection",
      },
    ];
  }

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
  if (
    (isQuestionPath(pathname) ||
      isModelPath(pathname) ||
      isMetricPath(pathname)) &&
    question
  ) {
    return [
      {
        id: question.id(),
        type: "card",
        model: getSearchModel(question),
      },
      {
        id: coerceCollectionId(question.collectionId()),
        type: "collection",
      },
    ];
  }
  return [{ url: pathname, type: "non-entity" }];
}

/** The search model a card is indexed under, which is how the Official rail keys its rows. */
function getSearchModel(question: Question): SearchModel {
  switch (question.type()) {
    case "model":
      return "dataset";
    case "metric":
      return "metric";
    default:
      return "card";
  }
}
