const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > dashboard > dashboard drill", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("should pass multiple filters for numeric column on drill-through (metabase#13062)", () => {
    const questionDetails = {
      name: "13062Q",
      query: {
        "source-table": REVIEWS_ID,
      },
    };

    const filter = {
      id: "18024e69",
      name: "Category",
      slug: "category",
      type: "category",
    };

    beforeEach(() => {
      // Set "Rating" Field type to: "Category"
      cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
        semantic_type: "type/Category",
      });

      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { id, card_id, dashboard_id } }) => {
          // Add filter to the dashboard
          cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
            parameters: [filter],
          });

          // Connect filter to the dashboard card
          cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
            dashcards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                size_x: 11,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: filter.id,
                    card_id,
                    target: ["dimension", ["field", REVIEWS.RATING, null]],
                  },
                ],
              },
            ],
          });

          // set filter values (ratings 5 and 4) directly through the URL
          cy.visit(`/dashboard/${dashboard_id}?category=5&category=4`);
          cy.findByText("2 selections");
        },
      );
    });

    it("when clicking on the field value and on the card title (metabase#13062)", () => {
      cy.findByTestId("dashcard").findByText("xavier").click();
      H.popover().findByText("Is xavier").click();

      cy.findByTestId("qb-filters-panel").within(() => {
        cy.findByText("Reviewer is xavier").should("be.visible");
        cy.findByText("Rating is equal to 2 selections").should("be.visible");
      });

      // xavier's review
      H.queryBuilderMain()
        .contains("Reprehenderit non error")
        .should("be.visible");

      H.assertQueryBuilderRowCount(1);

      cy.log("when clicking on the card title (metabase#13062-2)");
      cy.go("back");
      H.filterWidget().findByText("2 selections").should("be.visible");

      cy.findByTestId("dashcard").findByText(questionDetails.name).click();
      cy.findByTestId("qb-filters-panel")
        .findByText("Rating is equal to 2 selections")
        .should("be.visible");

      // Sample review body
      H.queryBuilderMain()
        .contains("Ad perspiciatis quis et consectetur.")
        .should("be.visible");

      H.assertQueryBuilderRowCount(907);
    });
  });

  it("should drill-through on a primary key out of 2000 rows", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    // In this test we're using already present dashboard ("Orders in a dashboard")
    const FILTER_ID = "7c9ege62";
    const PK_VALUE = "7602";

    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [
        {
          id: FILTER_ID,
          name: "Category",
          slug: "category",
          type: "category",
          default: ["Gadget"],
        },
      ],
    });
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              ],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.tableHeaderClick("ID");

    cy.get(".test-Table-ID").contains(PK_VALUE).first().click();

    cy.wait("@dataset");

    cy.findByTestId("object-detail").within(() => {
      cy.findAllByText(PK_VALUE);
    });

    const pattern = new RegExp(`/question\\?objectId=${PK_VALUE}#*`);
    cy.url().should("match", pattern);
  });

  it("should drill-through on a foreign key (metabase#8055)", () => {
    // In this test we're using already present dashboard ("Orders in a dashboard")
    const FILTER_ID = "7c9ege62";

    cy.log("Add filter (with the default Category) to the dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [
        {
          id: FILTER_ID,
          name: "Category",
          slug: "category",
          type: "category",
          default: ["Gadget"],
        },
      ],
    });

    cy.log("Connect filter to the existing card");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              ],
            },
          ],
          visualization_settings: {},
        },
      ],
    });
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    // Product ID in the first row (query fails for User ID as well)
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("105").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("View details").click();

    cy.log("Reported on v0.29.3");
    cy.wait("@dataset").then((xhr) => {
      expect(xhr.response.body.error).not.to.exist;
    });
    cy.findByTestId("object-detail")
      .findAllByText("Fantastic Wool Shirt")
      .should("have.length", 3)
      .and("be.visible");
  });

  it("should apply correct date range on a graph drill-through (metabase#13785)", () => {
    cy.log("Create a question");

    H.createQuestion({
      name: "13785",
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["count"]],
        breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "bar",
    }).then(({ body: { id: QUESTION_ID } }) => {
      H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
        cy.log("Add filter to the dashboard");

        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            {
              id: "4ff53514",
              name: "Date Filter",
              slug: "date_filter",
              type: "date/all-options",
            },
          ],
        });

        cy.log("Add question to the dashboard");
        H.addOrUpdateDashboardCard({
          card_id: QUESTION_ID,
          dashboard_id: DASHBOARD_ID,
          card: {
            // Set "Click behavior"
            visualization_settings: {
              click_behavior: {
                type: "crossfilter",
                parameterMapping: {
                  "4ff53514": {
                    source: {
                      type: "column",
                      id: "CREATED_AT",
                      name: "Created At",
                    },
                    target: {
                      type: "parameter",
                      id: "4ff53514",
                    },
                    id: "4ff53514",
                  },
                },
              },
            },
            // Connect filter and card
            parameter_mappings: [
              {
                parameter_id: "4ff53514",
                card_id: QUESTION_ID,
                target: ["dimension", ["field", REVIEWS.CREATED_AT, null]],
              },
            ],
          },
        });

        H.visitDashboard(DASHBOARD_ID);

        cy.intercept(
          "POST",
          `/api/dashboard/${DASHBOARD_ID}/dashcard/*/card/${QUESTION_ID}/query`,
        ).as("cardQuery");

        H.chartPathWithFillColor("#509EE3")
          .eq(14) // August 2026 (Total of 12 reviews, 9 unique days)
          .click();

        cy.wait("@cardQuery");
        cy.url().should("include", "2026-08");
        H.chartPathWithFillColor("#509EE3").should("have.length", 1);
        // Since hover doesn't work in Cypress we can't assert on the popover that's shown when one hovers the bar
        // But when this issue gets fixed, Y-axis should definitely show "12" (total count of reviews)
        H.echartsContainer().get("text").contains("12");
      });
    });
  });

  it("should keep card's display when doing zoom drill-through from dashboard (metabase#38307)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    const questionDetails = {
      name: "38307",
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["count"]],
        breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "bar",
    };

    const dashboardDetails = {
      name: "38307",
    };

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);

        // click the first bar on the card's graph and do a zoom drill-through
        H.chartPathWithFillColor("#509EE3").eq(0).click();
        cy.findByText("See this month by week").click();

        cy.wait("@dataset");

        // check that the display is still a bar chart by checking that a .bar element exists
        H.chartPathWithFillColor("#509EE3").should("exist");
      },
    );
  });

  it('should drill-through on PK/FK to the "object detail" when filtered by explicit joined column (metabase#15331)', () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.createQuestion({
      name: "15331",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
        // Add filter to the dashboard
        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            {
              name: "Date Filter",
              slug: "date_filter",
              id: "354cb21f",
              type: "date/all-options",
            },
          ],
        });
        // Add question to the dashboard
        H.addOrUpdateDashboardCard({
          card_id: QUESTION_ID,
          dashboard_id: DASHBOARD_ID,
          card: {
            size_x: 19,
            size_y: 10,
            // Connect dashboard filter to the question
            parameter_mappings: [
              {
                parameter_id: "354cb21f",
                card_id: QUESTION_ID,
                target: [
                  "dimension",
                  [
                    "joined-field",
                    "Products",
                    ["field-id", PRODUCTS.CREATED_AT],
                  ],
                ],
              },
            ],
          },
        });

        // Set the filter to `previous 30 years` directly through the url
        cy.visit(`/dashboard/${DASHBOARD_ID}?date_filter=past30years`);
      });
    });
    H.tableHeaderColumn("Quantity");
    cy.findByTestId("table-body")
      .get("[data-dataset-index=0] > [data-column-id='ID']")
      .should("have.text", "3") // Subject to change - sensitive to year shifting in the Sample Database
      .click();

    cy.wait("@dataset").then((xhr) => {
      expect(xhr.response.body.error).to.not.exist;
    });
    cy.findByTestId("object-detail").within(() => {
      cy.findByText("Subtotal");
      cy.findByText("52.72");
    });
  });

  it("should display correct tooltip value for multiple series charts on dashboard (metabase#15612)", () => {
    H.createNativeQuestion({
      name: "15612_1",
      native: { query: 'select 1 as AXIS, 5 as "VALUE"' },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["AXIS"],
        "graph.metrics": ["VALUE"],
      },
    }).then(({ body: { id: QUESTION1_ID } }) => {
      H.createNativeQuestion({
        name: "15612_2",
        native: { query: 'select 1 as AXIS, 10 as "VALUE"' },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["AXIS"],
          "graph.metrics": ["VALUE"],
        },
      }).then(({ body: { id: QUESTION2_ID } }) => {
        H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
          // Add the first question to the dashboard
          H.addOrUpdateDashboardCard({
            card_id: QUESTION1_ID,
            dashboard_id: DASHBOARD_ID,
            card: {
              series: [
                {
                  id: QUESTION2_ID,
                },
              ],
            },
          });

          H.visitDashboard(DASHBOARD_ID);

          const assertTooltipValues = () =>
            H.echartsTooltip().within(() => {
              H.tooltipHeader().should("have.text", 1);
              H.assertTooltipRow("15612_1", { color: "#88BF4D", value: "5" });
              H.assertTooltipRow("15612_2", { color: "#98D9D9", value: "10" });
            });

          H.chartPathWithFillColor("#88BF4D").first().trigger("mousemove");
          assertTooltipValues();

          H.chartPathWithFillColor("#98D9D9")
            .first()
            .trigger("mousemove", { force: true });
          assertTooltipValues();
        });
      });
    });
  });

  describe("should preserve dashboard filter and apply it to the question on a drill-through (metabase#11503)", () => {
    const ordersIdFilter = {
      name: "Orders ID",
      slug: "orders_id",
      id: "82a5a271",
      type: "id",
      sectionId: "id",
    };

    const productsIdFilter = {
      name: "Products ID",
      slug: "products_id",
      id: "a4dc1976",
      type: "id",
      sectionId: "id",
    };

    const parameters = [ordersIdFilter, productsIdFilter];

    beforeEach(() => {
      // Add filters to the dashboard
      cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
        parameters,
      });

      // Connect those filters to the existing dashboard card
      cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
        dashcards: [
          {
            id: ORDERS_DASHBOARD_DASHCARD_ID,
            card_id: ORDERS_QUESTION_ID,
            row: 0,
            col: 0,
            size_x: 16,
            size_y: 8,
            series: [],
            visualization_settings: {},
            parameter_mappings: [
              {
                parameter_id: ordersIdFilter.id,
                card_id: ORDERS_QUESTION_ID,
                target: ["dimension", ["field", ORDERS.ID, null]],
              },
              {
                parameter_id: productsIdFilter.id,
                card_id: ORDERS_QUESTION_ID,
                target: [
                  "dimension",
                  [
                    "field",
                    PRODUCTS.ID,
                    {
                      "source-field": ORDERS.PRODUCT_ID,
                    },
                  ],
                ],
              },
            ],
          },
        ],
      });

      H.visitDashboard(ORDERS_DASHBOARD_ID);
    });

    it("should correctly drill-through on Orders and on Products filter (metabase#11503)", () => {
      setFilterValue(ordersIdFilter.name);

      drillThroughCardTitle("Orders");

      H.queryBuilderMain().within(() => {
        cy.findByText("37.65").should("be.visible");
        cy.findByText("110.93").should("be.visible");
        cy.findByText("52.72").should("not.exist");
      });

      H.assertQueryBuilderRowCount(2);

      postDrillAssertion("ID is 2 selections");

      cy.log("should correctly drill-through on Products filter (metabase#11503-2)");
      cy.go("back");
      H.filterWidget().eq(0).should("contain", "2 selections");
      H.clearFilterWidget(0);
      H.filterWidget().eq(0).should("contain", ordersIdFilter.name);
      setFilterValue(productsIdFilter.name);

      drillThroughCardTitle("Orders");
      H.queryBuilderMain().within(() => {
        cy.findByText("37.65").should("not.exist");
        cy.findAllByText("105.12").should("not.be.empty");
      });

      H.assertQueryBuilderRowCount(191);

      postDrillAssertion("Product → ID is 2 selections");
    });

    function setFilterValue(filterName) {
      H.filterWidget().contains(filterName).click();
      cy.findByPlaceholderText("Enter an ID").type("1,2,");
      cy.button("Add filter").click();
      cy.findByText("2 selections");
    }

    function postDrillAssertion(filterName) {
      cy.findByTestId("qb-filters-panel").findByText(filterName).click();
      H.popover({ testId: "filter-picker-dropdown" }).within(() => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        cy.findAllByRole("combobox")
          .last()
          .parent()
          .should("contain", "1")
          .and("contain", "2");
        cy.button("Update filter").should("be.visible");
      });
    }
  });
});

function drillThroughCardTitle(title) {
  cy.findByTestId("legend-caption").contains(title).click();
  cy.contains(`Started from ${title}`);
}
