import type {
  Card,
  TestNativeQuerySpecWithDatabase,
  TestQuerySpecWithDatabase,
} from "metabase-types/api";

import { createTestNativeQuery, createTestQuery } from "./api";
import { type CardDetails as CardDetails_, createCard } from "./api/createCard";
import { visitQuestionAdhoc } from "./e2e-ad-hoc-question-helpers";
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

export function visitCard<C extends Pick<Card, "id" | "type">>(
  card: C,
): Cypress.Chainable<C> {
  switch (card.type) {
    case "question":
      return visitQuestion(card.id).then(() => card);
    case "model":
      return visitModel(card.id).then(() => card);
    case "metric":
      return visitMetric(card.id).then(() => card);
  }
}

export function visitAdHocQuestionWithTestQuery(
  details: CardDetails<TestQuerySpecWithDatabase>,
  options: {
    mode?: "notebook";
    skipWaiting?: boolean;
  } = {},
) {
  return H.createTestQuery(details.dataset_query).then((dataset_query) => {
    const question: Card = {
      display: "table" as const,
      ...details,
      dataset_query,
    };
    return visitQuestionAdhoc(question, options);
  });
}

export function visitAdHocQuestionWithTestNativeQuery(
  details: CardDetails<TestNativeQuerySpecWithDatabase>,
  options: {
    mode?: "notebook";
    autorun?: boolean;
    skipWaiting?: boolean;
  } = {},
) {
  return H.createTestNativeQuery(details.dataset_query).then(
    (dataset_query) => {
      const question: Card = {
        display: "table" as const,
        ...details,
        dataset_query,
      };
      return visitQuestionAdhoc(question, options);
    },
  );
}
