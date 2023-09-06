import { produce } from "immer";
import {
  restore,
  visitDashboard,
  visitQuestion,
  addOrUpdateDashboardCard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { PRODUCTS } = SAMPLE_DATABASE;

const filterDetails = {
  name: "Category",
  slug: "category",
  id: "c32a49e1",
  type: "string/contains",
  default: ["Doohickey"],
};

const questionDetails = {
  name: "Question",
  native: {
    query: "select * from products where {{category}} limit 10",
    "template-tags": {
      category: {
        id: "6b8b10ef-0104-1047-1e5v-2492d5954555",
        name: "category",
        "display-name": "Category",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/contains",
      },
    },
  },
  parameters: [
    {
      id: "6b8b10ef-0104-1047-1e5v-2492d5954555",
      type: "string/contains",
      target: ["dimension", ["template-tag", "category"]],
      name: "Category",
      slug: "category",
    },
  ],
};

const dashboardDetails = {
  name: "Dashboard #20049",
  parameters: [filterDetails],
};

describe.skip("issue 20049", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");
      cy.wrap(card_id).as("questionId");

      addOrUpdateDashboardCard({
        card_id,
        dashboard_id,
        card: {
          id,
          parameter_mappings: [
            {
              card_id,
              parameter_id: filterDetails.id,
              target: ["dimension", ["template-tag", filterDetails.slug]],
            },
          ],
        },
      });
    });
  });

  it("Filter should stop applying if mapped question parameter is changed (metabase#20049)", () => {
    cy.get("@questionId").then(questionId => {
      updateQuestionParameterWidgetType(questionId);
      visitQuestion(questionId);
      verifyQuestionParameterType("String does not contain");
    });

    cy.get("@dashboardId").then(dashboardId => {
      // visit dashboard again
      visitDashboard(dashboardId);

      // make sure parameter is not applied
      cy.findAllByTestId("table-row").eq(0).should("not.contain", "Doohickey");
    });
  });
});

function updateQuestionParameterWidgetType(questionId) {
  const updatedNative = produce(questionDetails.native, draft => {
    draft["template-tags"][filterDetails.slug]["widget-type"] =
      "string/does-not-contain";
  });

  const updatedParameter = produce(questionDetails.parameters[0], draft => {
    draft.type = "string/does-not-contain";
  });

  const newQuestionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      native: updatedNative,
      type: "native",
    },
    parameters: [updatedParameter],
  };

  cy.request("PUT", `/api/card/${questionId}`, newQuestionDetails);
}

function verifyQuestionParameterType(type) {
  cy.findByTestId("query-builder-main").findByText("Open Editor").click();
  cy.icon("variable").click();

  cy.findByText("Filter widget type")
    .parent()
    .findByTestId("select-button")
    .contains(type);
}
