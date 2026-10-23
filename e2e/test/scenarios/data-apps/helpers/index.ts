import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  DataAppQuestions,
  DataAppTestEnv,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { CollectionId, VisualizationDisplay } from "metabase-types/api";

const { H } = cy;

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const createOrdersQuestion = (
  collectionId: CollectionId,
  name: string,
  query: Omit<StructuredQuestionDetails["query"], "source-table">,
  display: VisualizationDisplay = "table",
) =>
  H.createQuestion({
    name,
    display,
    query: { "source-table": ORDERS_ID, ...query },
    collection_id: collectionId,
  }).then(({ body }) => body);

/** Publishes ORDERS to the Library and creates the app's questions on it in the app's collection. */
export const createDataAppQuestions = (
  collectionId: CollectionId,
): Cypress.Chainable<DataAppQuestions> => {
  H.publishDataAppTables([ORDERS_ID]);

  return createOrdersQuestion(collectionId, "Orders", {}).then((orders) =>
    createOrdersQuestion(collectionId, "Orders count", {
      aggregation: [["count"]],
    }).then((ordersCount) =>
      createOrdersQuestion(
        collectionId,
        "Orders by year",
        {
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        "line",
      ).then(
        (ordersByYear): DataAppQuestions => ({
          collectionId,
          ordersEntityId: orders.entity_id,
          ordersCountEntityId: ordersCount.entity_id,
          ordersByYearId: ordersByYear.id,
        }),
      ),
    ),
  );
};

/** A `testEnv` function that creates the app's questions and builds the test env from them with `build`. */
export const withDataAppQuestions =
  <TestEnv>(
    build: (
      questions: DataAppQuestions,
    ) => TestEnv | Cypress.Chainable<TestEnv>,
  ) =>
  (collectionId: CollectionId) =>
    createDataAppQuestions(collectionId).then(build);

/** The `testEnv` function giving the Overview page of the fixture its Orders count and Orders questions. */
export const dataAppTestEnv = ({
  ordersEntityId,
  ordersCountEntityId,
}: DataAppQuestions): DataAppTestEnv => ({
  scalarQuery: {
    source: { type: "card", entityId: ordersCountEntityId },
  },
  questionQuery: {
    source: { type: "card", entityId: ordersEntityId },
  },
});
