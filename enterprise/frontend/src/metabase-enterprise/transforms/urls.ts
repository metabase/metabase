import type { CardId, DatasetQuery } from "metabase-types/api";

export const ROOT_URL = "/admin/transforms";

export function getOverviewPageUrl() {
  return ROOT_URL;
}

export function getNewTransformPageUrl() {
  return `${ROOT_URL}/new`;
}

export function getNewTransformFromTypePageUrl(type: DatasetQuery["type"]) {
  return `${ROOT_URL}/new/${type}`;
}

export function getNewTransformFromCardPageUrl(cardId: CardId) {
  return `${ROOT_URL}/new/card/${cardId}`;
}
