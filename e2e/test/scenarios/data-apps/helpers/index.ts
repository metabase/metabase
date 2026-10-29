import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  Card,
  CollectionId,
  DataApp,
  TestStageSpec,
  VisualizationDisplay,
  WritebackAction,
} from "metabase-types/api";

const { H } = cy;

const { ORDERS_ID } = SAMPLE_DATABASE;

const COUNT = { type: "operator", operator: "count" } as const;

function createOrdersCard(
  collectionId: CollectionId,
  name: string,
  display: VisualizationDisplay,
  stage: TestStageSpec = {},
): Cypress.Chainable<Card> {
  return H.createTestQuery({
    database: SAMPLE_DB_ID,
    stages: [{ source: { type: "table", id: ORDERS_ID }, ...stage }],
  }).then((dataset_query) =>
    H.createCard({
      name,
      display,
      dataset_query,
      collection_id: collectionId,
    }),
  );
}

/** Creates the questions the kitchen-sink app reads, in `app`'s collection. */
function createKitchenSinkQuestions(app: DataApp) {
  createOrdersCard(app.resource_collection_id, "Orders", "table");
  createOrdersCard(app.resource_collection_id, "Orders count", "scalar", {
    aggregations: [COUNT],
  });
  createOrdersCard(app.resource_collection_id, "Orders by year", "line", {
    aggregations: [COUNT],
    breakouts: [{ type: "column", name: "CREATED_AT", unit: "year" }],
  });
}

type KitchenSinkDataAppDetails = {
  display_name?: string;
  description?: string | null;
  allowed_hosts?: string[];
  enabled?: boolean;
};

type KitchenSinkDataAppOpts = {
  withAddTeamAction?: boolean;
};

/**
 * Creates the Library, publishes ORDERS to it, and creates the kitchen-sink app,
 * readable by All Users, with its questions, the "Add team" action when asked,
 * and its bundle built against them.
 */
export function createKitchenSinkDataApp(
  details: KitchenSinkDataAppDetails = {},
  { withAddTeamAction = false }: KitchenSinkDataAppOpts = {},
): Cypress.Chainable<DataApp> {
  H.createLibrary();
  H.publishTables({ table_ids: [ORDERS_ID] });

  return H.createDataApp({
    name: H.DATA_APP_NAME,
    display_name: H.DATA_APP_DISPLAY_NAME,
    ...details,
  }).then((app) => {
    H.addDataAppGroups(app, [USER_GROUPS.ALL_USERS_GROUP]);
    createKitchenSinkQuestions(app);
    if (withAddTeamAction) {
      createAddTeamAction(app.resource_collection_id);
    }
    return H.uploadDataAppBundle(app);
  });
}

/** Creates the model-less "Add team" action, which inserts a team into `scoreboard_actions`. */
export function createAddTeamAction(
  collectionId: CollectionId,
): Cypress.Chainable<WritebackAction> {
  return H.createTestNativeQuery({
    database: WRITABLE_DB_ID,
    query:
      "INSERT INTO scoreboard_actions (team_name, score) VALUES ({{team_name}}, {{score}})",
    templateTags: {
      team_name: { type: "text", "display-name": "Team name", required: true },
      score: { type: "number", "display-name": "Score", required: true },
    },
  }).then((dataset_query) =>
    H.createAction({
      name: "Add team",
      type: "query",
      collection_id: collectionId,
      dataset_query,
      parameters: [
        {
          id: "team_name",
          slug: "team_name",
          name: "Team name",
          type: "string/=",
          target: ["variable", ["template-tag", "team_name"]],
          required: true,
        },
        {
          id: "score",
          slug: "score",
          name: "Score",
          type: "number/=",
          target: ["variable", ["template-tag", "score"]],
          required: true,
        },
      ],
    }),
  );
}
