import type {
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  TestNativeQuerySpecWithDatabase,
  TestQuerySpecWithDatabase,
} from "metabase-types/api";

import {
  type DashboardDetails,
  createDashboard,
  createTestNativeQuery,
  createTestQuery,
} from "./api";
import { type CardDetails as CardDetails_, createCard } from "./api/createCard";
import { visitQuestionAdhoc } from "./e2e-ad-hoc-question-helpers";
import { visitMetric, visitModel, visitQuestion } from "./e2e-misc-helpers";

type CardDetails<T> = Omit<CardDetails_, "dataset_query"> & {
  dataset_query: T;
};

type QuestionAndDashboardDetails<T> = {
  questionDetails: CardDetails<T>;
  dashboardDetails?: DashboardDetails;
  cardDetails?: Partial<DashboardCard>;
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

export function createQuestionAndDashboardWithTestQuery({
  questionDetails,
  dashboardDetails,
  cardDetails,
}: QuestionAndDashboardDetails<TestQuerySpecWithDatabase>) {
  return createCardWithTestQuery(questionDetails).then((card) =>
    addCardToNewDashboard(card, dashboardDetails, cardDetails),
  );
}

export function createNativeQuestionAndDashboardWithTestQuery({
  questionDetails,
  dashboardDetails,
  cardDetails,
}: QuestionAndDashboardDetails<TestNativeQuerySpecWithDatabase>) {
  return createCardWithTestNativeQuery(questionDetails).then((card) =>
    addCardToNewDashboard(card, dashboardDetails, cardDetails),
  );
}

function addCardToNewDashboard(
  card: Card,
  dashboardDetails: DashboardDetails | undefined,
  cardDetails: Partial<DashboardCard> | undefined,
): Cypress.Chainable<
  Cypress.Response<Dashboard> & {
    body: DashboardCard;
    dashboardId: Dashboard["id"];
    dashboardTabs: Dashboard["tabs"];
    questionId: CardId;
  }
> {
  const tabs = dashboardDetails?.tabs ?? [];
  const dashboardTabId = tabs[0]?.id ?? null;

  return createDashboard(dashboardDetails).then(
    ({ body: { id: dashboardId } }) =>
      cy
        .request<Dashboard>("PUT", `/api/dashboard/${dashboardId}`, {
          tabs,
          dashcards: [
            {
              id: -1,
              card_id: card.id,
              dashboard_tab_id: dashboardTabId,
              // Add sane defaults for the dashboard card size and position
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 6,
              ...cardDetails,
            },
          ],
        })
        .then((response) => ({
          ...response,
          body: response.body.dashcards[0],
          dashboardId,
          dashboardTabs: response.body.tabs,
          questionId: card.id,
        })),
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
