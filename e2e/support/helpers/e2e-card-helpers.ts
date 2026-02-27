import type {
  Card,
  TestNativeQuerySpecWithDatabase,
  TestQuerySpecWithDatabase,
} from "metabase-types/api";

import { createTestNativeQuery, createTestQuery } from "./api";
import { type CardDetails as CardDetails_, createCard } from "./api/createCard";
import { visitMetric, visitModel, visitQuestion } from "./e2e-misc-helpers";

type CardDetails<T> = Omit<CardDetails_, "dataset_query"> & {
  dataset_query: T;
};

export function createCardWithTestQuery(
  details: CardDetails<TestQuerySpecWithDatabase>,
): Cypress.Chainable<Card> {
  return createTestQuery(details.dataset_query).then((dataset_query) =>
    createCard({ ...details, dataset_query }),
  );
}

export function createCardWithTestNativeQuery(
  details: CardDetails<TestNativeQuerySpecWithDatabase>,
): Cypress.Chainable<Card> {
  return createTestNativeQuery(details.dataset_query).then((dataset_query) =>
    createCard({ ...details, dataset_query }),
  );
}

export function visitCard(card: Pick<Card, "id" | "type">) {
  switch (card.type) {
    case "question":
      return visitQuestion(card.id);
    case "model":
      return visitModel(card.id);
    case "metric":
      return visitMetric(card.id);
  }
}
