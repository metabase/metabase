import fetchMock from "fetch-mock";

import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  Card,
  CardId,
  CardQueryMetadata,
  Dataset,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { PERMISSION_ERROR } from "./constants";

export function setupCardEndpoints(card: Card) {
  fetchMock.get(`path:/api/card/${card.id}`, card);
  fetchMock.put(`path:/api/card/${card.id}`, async url => {
    const lastCall = fetchMock.lastCall(url);
    return createMockCard(await lastCall?.request?.json());
  });
  fetchMock.get(`path:/api/card/${card.id}/series`, []);
}

export function setupCardQueryMetadataEndpoint(
  card: Card,
  metadata: CardQueryMetadata,
) {
  fetchMock.get(`path:/api/card/${card.id}/query_metadata`, metadata);
}

export function setupCardsEndpoints(cards: Card[]) {
  fetchMock.get({ url: "path:/api/card", overwriteRoutes: false }, cards);
  setupCardCreateEndpoint();
  cards.forEach(card => setupCardEndpoints(card));
}

export function setupCardCreateEndpoint() {
  fetchMock.post("path:/api/card", async url => {
    const lastCall = fetchMock.lastCall(url);
    return createMockCard(await lastCall?.request?.json());
  });
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

export function setupCardPublicLinkEndpoints(cardId: CardId) {
  fetchMock.post(`path:/api/card/${cardId}/public_link`, {
    id: cardId,
    uuid: "mock-uuid",
  });
  fetchMock.delete(`path:/api/card/${cardId}/public_link`, {
    id: cardId,
  });
}
