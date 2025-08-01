import type { CardId, DatasetQuery } from "metabase-types/api";

export const ROOT_URL = "/admin/transforms";

export function getNewTransformPageUrl(type: DatasetQuery["type"]) {
  return `${ROOT_URL}/new/${type}`;
}

export function newTransformFromCardPageUrl(cardId: CardId) {
  return `${ROOT_URL}/new/card/${cardId}`;
}
