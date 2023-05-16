import fetchMock from "fetch-mock";
import { Card, Dataset } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  getQuestionVirtualTableId,
  convertSavedQuestionToVirtualTable,
} from "metabase-lib/metadata/utils/saved-questions";
import { PERMISSION_ERROR } from "./constants";

export function setupCardEndpoints(card: Card) {
  fetchMock.get(`path:/api/card/${card.id}`, card);
  fetchMock.put(`path:/api/card/${card.id}`, async url => {
    const lastCall = fetchMock.lastCall(url);
    return createMockCard(await lastCall?.request?.json());
  });

  const virtualTableId = getQuestionVirtualTableId(card.id);
  fetchMock.get(`path:/api/table/${virtualTableId}/query_metadata`, {
    ...convertSavedQuestionToVirtualTable(card),
    fields: card.result_metadata.map(field => ({
      ...field,
      table_id: virtualTableId,
    })),
    dimension_options: {},
  });
}

export function setupCardsEndpoints(cards: Card[]) {
  fetchMock.get({ url: "path:/api/card", overwriteRoutes: false }, cards);
  cards.forEach(card => setupCardEndpoints(card));
}

export function setupUnauthorizedCardEndpoints(card: Card) {
  fetchMock.get(`path:/api/card/${card.id}`, {
    status: 403,
    body: PERMISSION_ERROR,
  });

  const virtualTableId = getQuestionVirtualTableId(card.id);
  fetchMock.get(`path:/api/table/${virtualTableId}/query_metadata`, {
    status: 403,
    body: PERMISSION_ERROR,
  });
}

export function setupUnauthorizedCardsEndpoints(cards: Card[]) {
  cards.forEach(card => setupUnauthorizedCardEndpoints(card));
}

export function setupCardQueryEndpoints(card: Card, dataset: Dataset) {
  fetchMock.post(`path:/api/card/${card.id}/query`, dataset);
}

export function setupCardQueryDownloadEndpoint(card: Card, type: string) {
  fetchMock.post(`path:/api/card/${card.id}/query/${type}`, {});
}
