import { Scope } from "nock";
import { Card } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  getQuestionVirtualTableId,
  convertSavedQuestionToVirtualTable,
} from "metabase-lib/metadata/utils/saved-questions";

export function setupCardEndpoints(scope: Scope, card: Card) {
  scope.get(`/api/card/${card.id}`).reply(200, card);
  scope
    .put(`/api/card/${card.id}`)
    .reply(200, (uri, body) => createMockCard(body as Card));

  const virtualTableId = getQuestionVirtualTableId(card.id);
  scope.get(`/api/table/${virtualTableId}/query_metadata`).reply(200, {
    ...convertSavedQuestionToVirtualTable(card),
    fields: card.result_metadata.map(field => ({
      ...field,
      table_id: virtualTableId,
    })),
    dimension_options: {},
  });
}

export function setupCardsEndpoints(scope: Scope, cards: Card[]) {
  scope.get("/api/card").reply(200, cards);
  cards.forEach(card => setupCardEndpoints(scope, card));
}
