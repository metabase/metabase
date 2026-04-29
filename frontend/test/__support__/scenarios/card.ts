import type {
  Alert,
  Card,
  CardQueryMetadata,
  Dataset,
  ModelIndex,
} from "metabase-types/api";
import { createMockCardQueryMetadata } from "metabase-types/api/mocks";

import {
  setupAlertsEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupModelIndexEndpoints,
} from "../server-mocks";

export type SavedCardScenarioOptions = {
  card: Card;
  /** If provided, registers `POST /api/card/:id/query` to return this dataset. */
  dataset?: Dataset;
  /** Defaults to a bare `createMockCardQueryMetadata()`. */
  metadata?: CardQueryMetadata;
  alerts?: Alert[];
  modelIndexes?: ModelIndex[];
};

/**
 * Registers all endpoints a saved card needs to render in QueryBuilder
 * and similar contexts. Replaces a 5-call chain that previously had to
 * thread the `card` through `setupCardsEndpoints`,
 * `setupCardQueryMetadataEndpoint`, `setupCardQueryEndpoints`,
 * `setupAlertsEndpoints`, and `setupModelIndexEndpoints`.
 */
export function setupSavedCardScenario({
  card,
  dataset,
  metadata = createMockCardQueryMetadata(),
  alerts = [],
  modelIndexes = [],
}: SavedCardScenarioOptions) {
  setupCardsEndpoints([card]);
  setupCardQueryMetadataEndpoint(card, metadata);
  if (dataset) {
    setupCardQueryEndpoints(card, dataset);
  }
  setupAlertsEndpoints(card, alerts);
  setupModelIndexEndpoints(card.id, modelIndexes);
}
