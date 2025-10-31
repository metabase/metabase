import fetchMock from "fetch-mock";

import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  Card,
  CardId,
  CardQueryMetadata,
  Dataset,
  GetPublicCard,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { PERMISSION_ERROR } from "./constants";

export function setupCardEndpoints(card: Card) {
  fetchMock.get(`path:/api/card/${card.id}`, card, {
    name: `card-${card.id}-get`,
  });
  fetchMock.put(
    `path:/api/card/${card.id}`,
    async (call) => {
      const lastCall = fetchMock.callHistory.lastCall(call.url);
      return createMockCard(await lastCall?.request?.json());
    },
    { name: `card-${card.id}-put` },
  );
  fetchMock.get(`path:/api/card/${card.id}/series`, [], {
    name: `card-${card.id}-series`,
  });
}

export function setupCardByEntityIdEndpoints(card: Card) {
  fetchMock.get(`path:/api/card/${card.entity_id}`, card, {
    name: `card-entity-${card.entity_id}-get`,
  });
  fetchMock.put(
    `path:/api/card/${card.entity_id}`,
    async (call) => {
      const lastCall = fetchMock.callHistory.lastCall(call.url);
      return createMockCard(await lastCall?.request?.json());
    },
    { name: `card-entity-${card.entity_id}-put` },
  );
  fetchMock.get(`path:/api/card/${card.entity_id}/series`, [], {
    name: `card-entity-${card.entity_id}-series`,
  });
}

export function setupCardQueryMetadataEndpoint(
  card: Card,
  metadata: CardQueryMetadata,
) {
  fetchMock.get(`path:/api/card/${card.id}/query_metadata`, metadata, {
    name: `card-${card.id}-query-metadata`,
  });
}

export function setupCardsEndpoints(cards: Card[]) {
  fetchMock.get({
    url: "path:/api/card",
    response: cards,
    name: "cards-list",
  });
  setupCardCreateEndpoint();
  cards.forEach((card) => setupCardEndpoints(card));
}

export function setupCardsUsingModelEndpoint(card: Card, usedBy: Card[] = []) {
  fetchMock.get({
    url: "path:/api/card",
    query: { f: "using_model", model_id: card.id },
    response: usedBy,
  });
}

export function setupCardCreateEndpoint() {
  fetchMock.post(
    "path:/api/card",
    async (call) => {
      const lastCall = fetchMock.callHistory.lastCall(call.url);
      return createMockCard(await lastCall?.request?.json());
    },
    { name: "card-create" },
  );
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
  cards.forEach((card) => setupUnauthorizedCardEndpoints(card));
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

export function setupListPublicCardsEndpoint(publicCards: GetPublicCard[]) {
  fetchMock.get("path:/api/card/public", publicCards);
}
