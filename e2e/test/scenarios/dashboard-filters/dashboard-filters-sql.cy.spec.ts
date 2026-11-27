import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  DashboardDetails,
  NativeQuestionDetails,
} from "e2e/support/helpers";
import type { Parameter } from "metabase-types/api";

const { H } = cy;
const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > SQL > number", () => {
  const questionDetails: NativeQuestionDetails = {
    name: "Question 1",
    native: {
      query:
        "SELECT * from products where true [[ and price > {{price}}]] [[ and rating > {{rating}} ]] limit 5;",
      "template-tags": {
        price: {
          type: "number",
          name: "price",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": "Price",
        },
        rating: {
          type: "number",
          name: "rating",
          id: "68821a54-f0f3-4f09-8c32-6f7c0e5e5399",
          "display-name": "Rating",
        },
      },
    },
  };

  const ratingFilter: Parameter = {
    name: "Rating",
    slug: "rating",
    id: "10c0d4ba",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails: DashboardDetails = {
    name: "Dashboard #31975",
    parameters: [ratingFilter],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 16,
            size_y: 8,
            parameter_mappings: [
              {
                parameter_id: ratingFilter.id,
                card_id,
                target: ["variable", ["template-tag", ratingFilter.slug]],
              },
            ],
          },
        ],
      });

      H.visitDashboard(dashboard_id);
    });
  });

  it("should filter a SQL question by number variables mapped to dashboard filters (metabase#31975)", () => {
    H.editDashboard();
    H.setFilter("Number", "Equal to");
    H.getDashboardCard().findByRole("button").click();
    H.popover().findByText("Price").click();
    H.saveDashboard();

    cy.log("the mapping is saved");
    cy.reload();

    cy.findByPlaceholderText("Number").type("95").blur();
    cy.findByPlaceholderText("Rating").type("3.8").blur();

    cy.findByTestId("table-body")
      .findAllByRole("row")
      .should("have.length", 2)
      // first line price
      .and("contain", "98.82")
      // first line rating
      .and("contain", "4.3")
      // second line price
      .and("contain", "95.93")
      // second line rating
      .and("contain", "4.4");
  });
});

describe("scenarios > dashboard > filters > SQL > required", () => {
  const variableQuestionDetails: NativeQuestionDetails = {
    name: "Return input value",
    native: {
      query: "select {{filter}}",
      "template-tags": {
        filter: {
          id: "7182a24e-163a-099c-b085-156f0879aaec",
          name: "filter",
          "display-name": "Filter",
          type: "text",
          required: true,
          default: "Foo",
        },
      },
    },
    display: "scalar",
  };

  const fieldFilterQuestionDetails: NativeQuestionDetails = {
    name: "SQL products category, required, 2 selections",
    native: {
      query: "select distinct category from PRODUCTS where {{filter}}",
      "template-tags": {
        filter: {
          id: "e33dc805-6b71-99a5-ee14-128383953986",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          "field-id": PRODUCTS.CATEGORY,
          "widget-type": "category",
          default: ["Gizmo", "Gadget"],
          required: true,
        },
      },
    },
  };

  const textFilter: Parameter = {
    name: "Text",
    slug: "text",
    id: "904aa8b7",
    type: "string/=",
    sectionId: "string",
    default: "Bar",
  };

  const categoryFilter: Parameter = {
    name: "Category",
    slug: "category",
    id: "49fcc65c",
    type: "category",
    default: "Widget",
  };

  const dashboardDetails: DashboardDetails = {
    name: "Required Filters Dashboard",
    parameters: [textFilter, categoryFilter],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should respect default filter precedence (dashboard filter, then SQL default) while keeping the url in sync", () => {
    createDashboardWithRequiredFilterCards();

    cy.log("dashboard filter defaults apply");
    cy.location("search").should("eq", "?category=Widget&text=Bar");
    H.getDashboardCard(0).should("contain", "Bar");
    H.getDashboardCard(1)
      .should("contain", "Widget")
      .and("not.contain", "Gizmo");
    cy.findByDisplayValue("Bar").should("be.visible");
    H.filterWidget().eq(1).should("contain", "Widget");

    cy.log("cleared dashboard filters fall back to the SQL defaults");
    H.clearFilterWidget(0);
    H.clearFilterWidget(1);
    cy.location("search").should("eq", "?category=&text=");
    assertSqlDefaultsApplied();
    cy.findByPlaceholderText("Text").should("be.visible");
    H.filterWidget().eq(1).should("contain", "Category");

    cy.log("cleared dashboard filters stay cleared on reload (metabase#13960)");
    cy.reload();
    assertSqlDefaultsApplied();
    cy.location("search").should("eq", "?category=&text=");

    cy.log("dashboard filter defaults apply on a subsequent visit");
    cy.visit("/collection/root");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Required Filters Dashboard").click();
    cy.location("search").should("eq", "?category=Widget&text=Bar");

    cy.log("removing a dashboard filter default clears it in the url");
    H.editDashboard();
    H.filterWidget({ isEditing: true, name: "Text" }).click();
    H.sidebar().within(() => {
      removeDefaultFilterValue("Bar");
    });
    H.saveDashboard();
    cy.location("search").should("eq", "?category=Widget&text=");
  });

  function createDashboardWithRequiredFilterCards() {
    H.createDashboard(dashboardDetails).then(
      ({ body: { id: dashboard_id } }) => {
        H.createNativeQuestion(variableQuestionDetails).then(
          ({ body: { id: variableCardId } }) => {
            H.createNativeQuestion(fieldFilterQuestionDetails).then(
              ({ body: { id: fieldFilterCardId } }) => {
                H.updateDashboardCards({
                  dashboard_id,
                  cards: [
                    {
                      card_id: variableCardId,
                      parameter_mappings: [
                        {
                          parameter_id: textFilter.id,
                          card_id: variableCardId,
                          target: ["variable", ["template-tag", "filter"]],
                        },
                      ],
                    },
                    {
                      card_id: fieldFilterCardId,
                      col: 11,
                      parameter_mappings: [
                        {
                          parameter_id: categoryFilter.id,
                          card_id: fieldFilterCardId,
                          target: ["dimension", ["template-tag", "filter"]],
                        },
                      ],
                    },
                  ],
                });
                H.visitDashboard(dashboard_id);
              },
            );
          },
        );
      },
    );
  }

  function assertSqlDefaultsApplied() {
    H.getDashboardCard(0).should("contain", "Foo");
    H.getDashboardCard(1)
      .should("contain", "Gizmo")
      .and("contain", "Gadget")
      .and("not.contain", "Widget")
      .and("not.contain", "Doohickey");
  }

  function removeDefaultFilterValue(value: string) {
    cy.findByDisplayValue(value).parent().find(".Icon-close").click();
  }
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
                "field-id": fieldId, // fieldId - Products.Category in Postgres DB
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
              "field-id": PRODUCTS.CATEGORY,
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
