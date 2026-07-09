import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;
const { PRODUCTS } = SAMPLE_DATABASE;

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
    H.getTableId({
      name: "products",
    }).then((tableId) => {
      return H.getFieldId({
        tableId,
        name: "category",
      }).then((fieldId) => {
        return H.createNativeQuestion({
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
                dimension: ["field", fieldId, null], // fieldId - Products.Category in Postgres DB
              },
            },
          },
          database: PG_DB_ID,
        });
      });
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
