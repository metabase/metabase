import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import type {
  Card,
  DatasetQuery,
  LegacyDatasetQuery,
  NativeQuery,
  StructuredQuery,
} from "metabase-types/api";

import { visitMetric, visitModel, visitQuestion } from "../e2e-misc-helpers";

export type QuestionDetails = {
  dataset_query: DatasetQuery;
  /**
   * Defaults to "test question".
   */
  name?: Card["name"];
  description?: Card["description"];
  /**
   * Entity type.
   * Defaults to "question".
   */
  type?: Card["type"];
  /**
   * Defaults to "table".
   */
  display?: Card["display"];
  parameters?: Card["parameters"];
  visualization_settings?: Card["visualization_settings"];
  /**
   * Parent collection in which to store this question.
   */
  collection_id?: Card["collection_id"];

  /**
   * Parent dashboard in which to store this question.
   */
  dashboard_id?: Card["dashboard_id"];
  /**
   * Used on the frontend to determine whether the question is pinned or not.
   */
  collection_position?: Card["collection_position"];
  embedding_params?: Card["embedding_params"];
  /**
   * Defaults to false.
   */
  enable_embedding?: Card["enable_embedding"];
  embedding_type?: Card["embedding_type"];
};

export type StructuredQuestionDetails = Omit<
  QuestionDetails,
  "dataset_query"
> & {
  /**
   * Defaults to SAMPLE_DB_ID.
   */
  database?: LegacyDatasetQuery["database"];
  query: StructuredQuery;
};

export type NativeQuestionDetails = Omit<QuestionDetails, "dataset_query"> & {
  /**
   * Defaults to SAMPLE_DB_ID.
   */
  database?: LegacyDatasetQuery["database"];
  native: NativeQuery;
};

export type Options = {
  /**
   * Whether to visit the question in order to load its metadata.
   * Defaults to false.
   */
  loadMetadata?: boolean;
  /**
   * Whether to visit the question after the creation or not.
   * Defaults to false.
   */
  visitQuestion?: boolean;
  /**
   * Whether to wrap a question id, to make it available outside of this scope.
   * Defaults to false.
   */
  wrapId?: boolean;
  /**
   * Alias a question id in order to use it later with `cy.get("@" + alias).
   * Defaults to "questionId".
   */
  idAlias?: string;
  /**
   * We need distinctive endpoint aliases for cases where we have multiple questions or nested questions.
   * Defaults to "cardQuery".
   */
  interceptAlias?: string;
};

export const createQuestion = (
  questionDetails: StructuredQuestionDetails,
  options?: Options,
): Cypress.Chainable<Cypress.Response<Card>> => {
  const { database = SAMPLE_DB_ID, name, query } = questionDetails;

  if (!query) {
    throw new Error('"query" attribute missing in questionDetails');
  }

  logAction("Create a QB question", name);

  return question(
    {
      ...questionDetails,
      dataset_query: { type: "query", query, database },
    },
    options,
  );
};

export const question = (
  {
    name = "test question",
    description,
    dataset_query,
    type = "question",
    display = "table",
    parameters,
    visualization_settings = {},
    collection_id,
    dashboard_id,
    collection_position,
    embedding_params,
    enable_embedding = false,
  }: QuestionDetails,
  {
    loadMetadata = false,
    visitQuestion: shouldVisitQuestion = false,
    wrapId = false,
    idAlias = "questionId",
    interceptAlias = "cardQuery",
  }: Options = {},
) => {
  return cy
    .request<Card>("POST", "/api/card", {
      name,
      description,
      dataset_query,
      display,
      parameters,
      visualization_settings,
      collection_id,
      dashboard_id,
      collection_position,
    })
    .then(({ body }) => {
      /**
       * Optionally, if you need question's id later in the test, outside the scope of this function,
       * you can use it like this:
       *
       * `cy.get("@questionId").then(id=> {
       *   doSomethingWith(id);
       * })
       */
      if (wrapId) {
        cy.wrap(body.id).as(idAlias);
      }

      if (type === "model" || type === "metric" || enable_embedding) {
        cy.request("PUT", `/api/card/${body.id}`, {
          type,
          enable_embedding,
          embedding_params,
        });
      }

      if (loadMetadata || shouldVisitQuestion) {
        if (type === "model") {
          visitModel(body.id);
        } else if (type === "metric") {
          visitMetric(body.id);
        } else {
          // We need to use the wildcard because endpoint for pivot tables has the following format: `/api/card/pivot/${id}/query`
          cy.intercept("POST", `/api/card/**/${body.id}/query`).as(
            interceptAlias,
          );
          visitQuestion(body.id);
          cy.wait("@" + interceptAlias); // Wait for `result_metadata` to load
        }
      }
    });
};

export const logAction = (
  /**
   * A title used to log the Cypress action/request that follows it.
   */
  title: string,
  /**
   * Optional question name.
   */
  questionName?: string,
) => {
  const fullTitle = `${title}: ${questionName}`;
  const message = questionName ? fullTitle : title;

  cy.log(message);
};
