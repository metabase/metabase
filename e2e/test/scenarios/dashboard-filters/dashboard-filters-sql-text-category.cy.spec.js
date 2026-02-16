import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import { applyFilterByType } from "../native-filters/helpers/e2e-field-filter-helpers";

import {
  DASHBOARD_SQL_TEXT_FILTERS,
  questionDetails,
} from "./shared/dashboard-filters-sql-text-category";

const { H } = cy;
const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > SQL > text/category", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { card_id, dashboard_id } }) => {
        H.visitQuestion(card_id);

        H.visitDashboard(dashboard_id);
      },
    );

    H.editDashboard();
  });

  it("should work when set through the filter widget", () => {
    Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(([filter]) => {
      cy.log(`Make sure we can connect ${filter} filter`);
      H.setFilter("Text or Category", filter);

      cy.findByText("Select…").click();
      H.popover().contains(filter).click();
    });

    H.saveDashboard();

    Object.entries(DASHBOARD_SQL_TEXT_FILTERS).forEach(
      ([filter, { value, representativeResult }], index) => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget().eq(index).click();

        if (["Is", "Is not"].includes(filter)) {
          cy.log("Wait for the correct popover to appear");
          cy.findByPlaceholderText(/search the list/i).should("be.visible");
        }
        applyFilterByType(filter, value);

        cy.log(`Make sure ${filter} filter returns correct result`);
        cy.findByTestId("dashcard").within(() => {
          cy.contains(representativeResult);
        });

        H.clearFilterWidget(index);
        cy.wait("@dashcardQuery");
      },
    );
  });

  it("should work when set as the default filter and when that filter is removed (metabase#20493)", () => {
    H.setFilter("Text or Category", "Is");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    H.popover().contains("Is").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Default value").next().click();

    applyFilterByType("Is", "Gizmo");

    H.saveDashboard();

    cy.findByTestId("dashcard").within(() => {
      cy.contains("Rustic Paper Wallet");
    });

    H.clearFilterWidget();

    cy.url().should("not.include", "Gizmo");

    H.filterWidget().click();

    applyFilterByType("Is", "Doohickey", { buttonLabel: "Update filter" });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rustic Paper Wallet").should("not.exist");
  });
});

describe("scenarios > dashboard > filters > SQL > text and multiple values", () => {
  const questionDetails = {
    name: "SQL",
    native: {
      query: "SELECT ID, CATEGORY FROM products WHERE CATEGORY IN ({{text}})",
      "template-tags": {
        text: {
          id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
          name: "text",
          "display-name": "Text",
          type: "text",
        },
      },
    },
  };

  const parameterDetails = {
    id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
    type: "string/=",
    name: "Text",
    slug: "text",
    isMultiSelect: true,
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      text: "enabled",
    },
  };

  function setFilterAndVerify({ values } = {}) {
    H.filterWidget().click();
    H.popover().within(() => {
      H.multiAutocompleteInput().type(values.join(","));
      cy.button("Add filter").click();
    });
    values.forEach((value) => {
      H.getDashboardCard().within(() => {
        cy.findAllByText(value).should("have.length.gte", 1);
        cy.findAllByText(value).should("have.length.gte", 1);
      });
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow multiple values for Number variables", () => {
    cy.log("create a dashboard");
    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: dashcard }) => {
      cy.wrap(dashcard.dashboard_id).as("dashboardId");
    });

    cy.log("set mapping");
    H.visitDashboard("@dashboardId");
    H.editDashboard();
    cy.findByTestId("fixed-width-filters").findByText("Text").click();
    H.selectDashboardFilter(H.getDashboardCard(), "Text");
    H.sidebar().findByLabelText("Multiple values").click();
    H.saveDashboard();

    cy.log("saved dashboard");
    setFilterAndVerify({ values: ["Gadget", "Widget"] });

    cy.log("public dashboard");
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitPublicDashboard(dashboardId),
    );
    setFilterAndVerify({ values: ["Gadget", "Widget"] });

    cy.log("embedded dashboard");
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      }),
    );
    setFilterAndVerify({ values: ["Gadget", "Widget"] });
  });
});

describe("issue 68998", { tags: "@external" }, () => {
  const sqlQueryDetails = `SELECT
  PRODUCTS.CATEGORY,
  SUM(TOTAL) AS TOTAL
FROM ORDERS
LEFT JOIN PRODUCTS on ORDERS.PRODUCT_ID = PRODUCTS.ID
WHERE {{field}}
GROUP BY PRODUCTS.CATEGORY`;
  const PG_DB_ID = 2;

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    // We update Postgres DB content to make sure dashcard with multiple datasets return values from both DBs
    // Otherwise we cannot tell the difference since sample data is identical
    H.queryQADB(
      "UPDATE PRODUCTS SET CATEGORY = 'New Category' where CATEGORY = 'Doohickey';",
    );

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  afterEach(() => {
    H.queryQADB(
      "UPDATE PRODUCTS SET CATEGORY = 'Doohickey' where CATEGORY = 'New Category';",
    );
  });

  it("should show all available category options for combined dataset (metabase#68998)", () => {
    H.createNativeQuestion({
      name: "SQL- Postgres",
      native: {
        query: sqlQueryDetails,
        "template-tags": {
          field: {
            "widget-type": "string/=",
            name: "field",
            "display-name": "Field",
            id: "3db026c4-5ec6-4568-9a40-eb704bac2bde",
            type: "dimension",
            dimension: ["field", 1552, null], // 1552 - Products.Category
          },
        },
      },
      database: PG_DB_ID,
    });

    H.createNativeQuestionAndDashboard({
      questionDetails: {
        name: "SQL",
        native: {
          query: sqlQueryDetails,
          "template-tags": {
            field: {
              "widget-type": "string/=",
              name: "field",
              "display-name": "Field",
              id: "c9c52a9c-ae2b-40d6-a8ee-581a529685ce",
              type: "dimension",
              dimension: ["field", PRODUCTS.CATEGORY, null],
            },
          },
        },
        database: SAMPLE_DB_ID,
      },
      dashboardDetails: {
        name: "Issue 68998",
      },
    }).then(({ dashboardId }) => {
      return cy.visit(`/dashboard/${dashboardId}`);
    });

    H.editDashboard();

    H.showDashcardVisualizerModal(0, { isVisualizerCard: false });

    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset("SQL- Postgres");
      H.switchToColumnsList();

      cy.findByText("Add more data").should("exist");
      cy.findByText("New Category").should("exist");
      cy.findByTestId("visualization-canvas")
        .findByText("SQL- Postgres")
        .should("exist");
    });
    H.saveDashcardVisualizerModal();

    H.setFilter("Text or Category", "Is");

    H.getDashboardCard(0)
      .findByTestId("parameter-mapper-container")
      .within(() => {
        cy.findAllByRole("button").eq(0).click();
      });

    H.popover().findByText("Field").click();

    H.getDashboardCard(0)
      .findByTestId("parameter-mapper-container")
      .within(() => {
        cy.findAllByRole("button").eq(2).click();
      });

    H.popover().findByText("Field").click();

    H.dashboardParametersDoneButton().click();
    H.saveDashboard();

    H.filterWidget().click();
    H.dashboardParametersPopover().within(() => {
      cy.findByText("New Category").should("exist");
    });
  });
});
