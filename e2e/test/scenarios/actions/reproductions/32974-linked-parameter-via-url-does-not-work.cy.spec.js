import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  getActionCardDetails,
  getNextUnsavedDashboardCardId,
  restore,
  modal,
  createAction,
  updateDashboardCards,
  setActionsEnabledForDB,
  undoToast,
  getDashboardCard,
  visitDashboard,
} from "e2e/support/helpers";
import {
  createMockActionParameter,
  createMockParameter,
} from "metabase-types/api/mocks";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const TEST_TABLE = "PRODUCTS";

const ID_ACTION_PARAMETER = createMockActionParameter({
  id: "86981cc2-2589-44b5-b559-2c8bbf5bb36a",
  name: "ID",
  slug: "id",
  type: "number/=",
  target: ["variable", ["template-tag", "id"]],
});

const ID_DASHBOARD_PARAMETER = createMockParameter({
  name: "ID",
  slug: "id",
  id: "9da7bdd3",
  type: "id",
  sectionId: "id",
});

const DASHBOARD_DETAILS = {
  name: "action dashboard",
  parameters: [ID_DASHBOARD_PARAMETER],
};

const MODEL_DETAILS = {
  name: "Products model",
  query: { "source-table": PRODUCTS_ID },
  database: SAMPLE_DB_ID,
  type: "model",
};

const EXPECTED_UPDATED_VALUE = 999;

const QUERY_ACTION = {
  name: "Query action",
  type: "query",
  parameters: [ID_ACTION_PARAMETER],
  database_id: SAMPLE_DB_ID,
  dataset_query: {
    type: "native",
    native: {
      query: `UPDATE ${TEST_TABLE} SET PRICE = ${EXPECTED_UPDATED_VALUE} WHERE ID = {{ ${ID_ACTION_PARAMETER.slug} }}`,
      "template-tags": {
        [ID_ACTION_PARAMETER.slug]: {
          id: ID_ACTION_PARAMETER.id,
          "display-name": ID_ACTION_PARAMETER.name,
          name: ID_ACTION_PARAMETER.slug,
          type: "text",
        },
      },
    },
    database: SAMPLE_DB_ID,
  },
  visualization_settings: {
    fields: {
      [ID_ACTION_PARAMETER.id]: {
        id: ID_ACTION_PARAMETER.id,
        required: true,
        fieldType: "number",
        inputType: "number",
      },
    },
  },
};

describe("Issue 32974", { tags: ["@external", "@actions"] }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(MODEL_DETAILS, {
      wrapId: true,
      idAlias: "modelId",
    });
    setActionsEnabledForDB(SAMPLE_DB_ID, true);
  });

  it("can submit query action linked with dashboard parameters (metabase#32974)", () => {
    cy.get("@modelId").then(modelId => {
      createAction({ ...QUERY_ACTION, model_id: modelId }).then(
        ({ body: { id: actionId } }) => {
          cy.wrap(actionId).as("actionId");
        },
      );
    });

    setupDashboard();

    visitDashboard("@dashboardId", { params: { id: 1 } });

    cy.log("Execute action");
    cy.button(QUERY_ACTION.name).click();
    modal().button(QUERY_ACTION.name).click();

    cy.log("Assertions");
    getDashboardCard().findByText(EXPECTED_UPDATED_VALUE).should("exist");
    modal().should("not.exist");
    undoToast().findByText("Query action ran successfully").should("exist");
  });
});

function setupDashboard() {
  cy.createDashboard(DASHBOARD_DETAILS).then(
    ({ body: { id: dashboardId } }) => {
      cy.wrap(dashboardId).as("dashboardId");
    },
  );

  cy.then(function () {
    updateDashboardCards({
      dashboard_id: this.dashboardId,
      cards: [
        {
          id: getNextUnsavedDashboardCardId(),
          card_id: this.modelId,
          // Map dashboard parameter to PRODUCTS.ID
          parameter_mappings: [
            {
              parameter_id: ID_DASHBOARD_PARAMETER.id,
              card_id: this.modelId,
              target: ["dimension", ["field-id", PRODUCTS.ID, null]],
            },
          ],
        },
        getActionCardDetails({
          label: QUERY_ACTION.name,
          action_id: this.actionId,
          // Map action's ID parameter to dashboard parameter
          parameter_mappings: [
            {
              parameter_id: ID_DASHBOARD_PARAMETER.id,
              target: [
                "variable",
                ["template-tag", ID_DASHBOARD_PARAMETER.slug],
              ],
            },
          ],
        }),
      ],
    });
  });
}
