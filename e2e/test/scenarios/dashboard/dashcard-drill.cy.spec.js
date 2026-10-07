const { H } = cy;
import { SAMPLE_DB_ID, USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { createMockParameter } from "metabase-types/api/mocks";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

const { ALL_USERS_GROUP, COLLECTION_GROUP } = USER_GROUPS;

describe("scenarios > dashboard > dashboard drill", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should pass multiple filters for numeric column on drill-through (metabase#13062)", () => {
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

        cy.wrap(dashboard_id).as("dashboardId");
      },
    );

    cy.get("@dashboardId").then((dashboardId) => {
      // set filter values (ratings 5 and 4) directly through the URL
      const dashboardUrl = `/dashboard/${dashboardId}?category=5&category=4`;

      cy.log("when clicking on the card title (metabase#13062-2)");
      cy.visit(dashboardUrl);
      H.filterWidget().should("contain", "2 selections");

      cy.findByTestId("dashcard").findByText(questionDetails.name).click();
      cy.findByTestId("qb-filters-panel")
        .findByText("Rating is equal to 2 selections")
        .should("be.visible");

      // Sample review body
      H.queryBuilderMain()
        .contains("Ad perspiciatis quis et consectetur.")
        .should("be.visible");

      H.assertQueryBuilderRowCount(907);

      cy.log("when clicking on the field value (metabase#13062-1)");
      cy.visit(dashboardUrl);
      H.filterWidget().should("contain", "2 selections");

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
    });
  });

  it("should drill-through on a foreign key (metabase#8055) and on a primary key out of 2000 rows", () => {
    // In this test we're using already present dashboard ("Orders in a dashboard")
    const FILTER_ID = "7c9ege62";
    const PK_VALUE = "7602";

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
    cy.intercept("POST", "/api/dataset").as("fkDataset");

    cy.log("Drill through on a foreign key (metabase#8055)");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    // Product ID in the first row (query fails for User ID as well)
    H.getDashboardCard().findByText("105").click();
    H.clickActionsPopover().findByText("View details").click();

    cy.log("Reported on v0.29.3");
    cy.wait("@fkDataset").then((xhr) => {
      expect(xhr.response.body.error).not.to.exist;
    });
    cy.findByTestId("object-detail")
      .findAllByText("Fantastic Wool Shirt")
      .should("have.length", 3)
      .and("be.visible");

    cy.log("Drill through on a primary key out of 2000 rows");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.intercept("POST", "/api/dataset").as("pkDataset");
    H.tableHeaderClick("ID");

    cy.get(".test-Table-ID").contains(PK_VALUE).first().click();

    cy.wait("@pkDataset");

    cy.findByTestId("object-detail").within(() => {
      cy.findAllByText(PK_VALUE);
    });

    const pattern = new RegExp(`/question\\?objectId=${PK_VALUE}#*`);
    cy.url().should("match", pattern);
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
        H.clickActionsPopover().findByText("See this month by week").click();

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
      .find("[data-dataset-index=0] > [data-column-id='ID']")
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
          H.echartsTriggerBlur();

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

    it("should correctly drill-through on Orders and Products filters (metabase#11503)", () => {
      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
        "dashcardQuery",
      );

      cy.log("Orders filter (metabase#11503-1)");
      H.getDashboardCard().findByText("52.72").should("be.visible");
      setFilterValue(ordersIdFilter.name);
      cy.wait("@dashcardQuery");

      drillThroughCardTitle("Orders");

      H.queryBuilderMain().within(() => {
        cy.findByText("37.65").should("be.visible");
        cy.findByText("110.93").should("be.visible");
        cy.findByText("52.72").should("not.exist");
      });

      H.assertQueryBuilderRowCount(2);

      postDrillAssertion("ID is 2 selections");

      cy.log("Products filter (metabase#11503-2)");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.filterWidget().should("contain", "2 selections");
      H.clearFilterWidget(0);
      H.filterWidget()
        .should("contain", ordersIdFilter.name)
        .and("not.contain", "2 selections");

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

describe("scenarios > dashboard > title drill", () => {
  describe("on a native question without connected dashboard parameters", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      const questionDetails = {
        name: "Q1",
        native: { query: 'SELECT 1 as "foo", 2 as "bar"' },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["foo"],
          "graph.metrics": ["bar"],
        },
      };

      H.createNativeQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id }, questionId }) => {
          cy.wrap(questionId).as("questionId");
          cy.wrap(dashboard_id).as("dashboardId");
        },
      );
    });

    it("should let you click through the title to the query builder with and without access to underlying data (metabase#13042)", () => {
      cy.get("@questionId").then((questionId) => {
        cy.log("as a user with access to underlying data");
        H.visitDashboard("@dashboardId");

        H.getDashboardCard().findByRole("link", { name: "Q1" }).as("title");
        cy.get("@title").realHover();
        cy.get("@title")
          .should("have.attr", "href")
          .and("include", `/question/${questionId}`);
        cy.get("@title").click();

        H.queryBuilderMain().within(() => {
          cy.findByText("This question is written in SQL.").should(
            "be.visible",
          );
          cy.findByText("foo").should("be.visible");
          cy.findByText("bar").should("be.visible");
        });

        cy.location("pathname").should("eq", `/question/${questionId}-q1`);

        cy.log("as a user without access to the underlying data");
        // Park the cursor off the grid, so only the mouseover below computes the title's href.
        cy.get("body").realHover({ position: "topLeft" });
        cy.signIn("nodata");
        H.visitDashboard("@dashboardId");

        H.getDashboardCard()
          .findByRole("link", { name: "Q1" })
          .as("nodataTitle");
        cy.get("@nodataTitle").trigger("mouseover");
        cy.get("@nodataTitle")
          .should("have.attr", "href")
          .and("include", `/question/${questionId}`);
        cy.get("@nodataTitle").click();

        H.queryBuilderMain().within(() => {
          cy.findByText("This question is written in SQL.").should(
            "be.visible",
          );
          cy.findByText("foo").should("be.visible");
          cy.findByText("bar").should("be.visible");
        });

        cy.location("pathname").should("eq", `/question/${questionId}-q1`);
      });
    });
  });

  describe("on a native question with a connected dashboard parameter", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      const filter = {
        name: "Text contains",
        slug: "text_contains",
        id: "98289b9b",
        type: "string/contains",
        sectionId: "string",
      };

      const questionDetails = {
        name: "16181",
        native: {
          query: "select count(*) from products where {{filter}}",
          "template-tags": {
            filter: {
              id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
              name: "filter",
              "display-name": "Filter",
              type: "dimension",
              dimension: ["field", PRODUCTS.TITLE, null],
              "widget-type": "string/contains",
              default: null,
            },
          },
        },
        display: "scalar",
      };

      const dashboardDetails = { parameters: [filter] };

      H.createNativeQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        // Connect filter to the card
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
                  target: ["dimension", ["template-tag", "filter"]],
                },
              ],
            },
          ],
        });

        cy.wrap(dashboard_id).as("dashboardId");
      });
    });

    it("'contains' filter should still work after title drill through IF the native question field filter's type matches exactly, with and without access to underlying data (metabase#16181)", () => {
      cy.log("as a user with access to underlying data");
      H.visitDashboard("@dashboardId");
      assertContainsFilterSurvivesTitleDrill();

      cy.log("as a user without access to underlying data");
      cy.signIn("nodata");
      H.visitDashboard("@dashboardId");
      assertContainsFilterSurvivesTitleDrill();
    });

    function assertContainsFilterSurvivesTitleDrill() {
      checkScalarResult("200");

      H.filterWidget().findByText("Text contains").click();
      cy.findByPlaceholderText("Enter some text").type("bb").blur();
      cy.button("Add filter").click();

      checkFilterLabelAndValue("Text contains", "bb");
      checkScalarResult("12");

      // Drill through on the question's title
      H.getDashboardCard().findByText("16181").click();

      checkFilterLabelAndValue("Filter", "bb");
      H.queryBuilderMain()
        .findByTestId("scalar-value")
        .invoke("text")
        .should("eq", "12");
    }
  });

  describe("on a simple question with a connected dashboard parameter", () => {
    const questionDetails = {
      name: "GUI Question",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "pie",
    };

    const filterWithDefaultValue = {
      name: "Category",
      slug: "category",
      id: "c32a49e1",
      type: "category",
      default: ["Doohickey"],
    };

    const filter = { name: "ID", slug: "id", id: "f2bf003c", type: "id" };

    const dashboardDetails = {
      parameters: [filterWithDefaultValue, filter],
    };

    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashboardCard, questionId }) => {
          const { card_id, dashboard_id } = dashboardCard;

          cy.wrap(questionId).as("questionId");
          cy.wrap(dashboard_id).as("dashboardId");
          cy.wrap(card_id).as("cardId");

          const mapFiltersToCard = {
            parameter_mappings: [
              {
                parameter_id: filterWithDefaultValue.id,
                card_id,
                target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
              },
              {
                parameter_id: filter.id,
                card_id,
                target: ["dimension", ["field", PRODUCTS.ID, null]],
              },
            ],
          };

          H.editDashboardCard(dashboardCard, mapFiltersToCard);
        },
      );
    });

    it("should let you click through the title to the query builder with the parameter applied as a filter, with and without access to underlying data", () => {
      cy.then(function () {
        const cardQueryUrl = `/api/dashboard/${this.dashboardId}/dashcard/*/card/${this.cardId}/query`;

        cy.log("as a user with access to underlying data");
        cy.intercept("POST", cardQueryUrl).as("cardQuery");
        H.visitDashboard(this.dashboardId);
        cy.wait("@cardQuery");

        // make sure query results are correct
        H.getDashboardCard().findByText("42");

        H.getDashboardCard()
          .findByRole("link", { name: "GUI Question" })
          .as("title");
        cy.get("@title").realHover();
        cy.get("@title")
          .should("have.attr", "href")
          .and("include", "/question#");
        cy.get("@title").click();

        // make sure the query builder filter is present
        cy.findByTestId("qb-filters-panel")
          .findByText("Category is Doohickey")
          .should("be.visible");

        // make sure the results match
        H.queryBuilderMain().findByText("42").should("be.visible");
        cy.location("href").should("include", "/question#");

        cy.log("as a user without access to underlying data");
        cy.signIn("nodata");
        cy.intercept("POST", cardQueryUrl).as("nodataCardQuery");
        H.visitDashboard(this.dashboardId);
        cy.wait("@nodataCardQuery");

        // make sure query results are correct
        H.getDashboardCard().findByText("42").should("be.visible");

        H.getDashboardCard()
          .findByRole("link", { name: "GUI Question" })
          .as("nodataTitle");
        cy.get("@nodataTitle").realHover();
        cy.get("@nodataTitle")
          .should("have.attr", "href")
          .and("include", "/question?category=Doohickey&id=#");
        cy.get("@nodataTitle").click();
        cy.wait("@nodataCardQuery");

        // make sure the results match
        H.queryBuilderMain().findByText("42").should("be.visible");
        cy.location("href").should(
          "include",
          `/question/${this.questionId}-gui-question?category=Doohickey&id=#`,
        );

        // update the parameter filter to a new value
        H.filterWidget().contains("Doohickey").click();
        H.dashboardParametersPopover().within(() => {
          cy.findByText("Doohickey").click();
          cy.findByText("Gadget").click();
          cy.findByText("Update filter").click();
        });

        // rerun the query with the newly set filter
        cy.findAllByTestId("run-button").first().click();
        cy.wait("@nodataCardQuery");

        // make sure the results reflect the new filter
        H.queryBuilderMain().findByText("53").should("be.visible");

        // make sure the set parameter filter persists after a page refresh
        cy.reload();
        cy.wait("@nodataCardQuery");

        H.queryBuilderMain().findByText("53").should("be.visible");

        // make sure the unset id parameter works
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.filterWidget().last().click();
        H.dashboardParametersPopover().within(() => {
          H.fieldValuesCombobox().type("5");
          cy.findByText("Add filter").click();
        });

        // rerun the query with the newly set filter
        cy.findAllByTestId("run-button").first().click();
        cy.wait("@nodataCardQuery");

        H.queryBuilderMain().findByText("1").should("be.visible");
      });
    });
  });

  describe("on a nested simple question with a connected dashboard parameter", () => {
    const questionDetails = {
      name: "GUI Question",
      query: {
        "source-table": PRODUCTS_ID,
      },
    };
    const baseNestedQuestionDetails = {
      name: "Nested GUI Question",
    };

    const idFilter = { name: "ID", slug: "id", id: "f2bf003c", type: "id" };

    const dashboardDetails = {
      name: "Nested question dashboard",
      parameters: [idFilter],
    };

    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      H.createQuestion(questionDetails, {
        wrapId: true,
        idAlias: "questionId",
      });

      cy.get("@questionId").then((questionId) => {
        const nestedQuestionDetails = {
          ...baseNestedQuestionDetails,
          query: {
            "source-table": `card__${questionId}`,
          },
        };
        H.createQuestion(nestedQuestionDetails, {
          wrapId: true,
          idAlias: "nestedQuestionId",
        });
      });

      H.createDashboard(dashboardDetails).then(
        ({ body: { id: dashboardId } }) => {
          cy.wrap(dashboardId).as("dashboardId");
        },
      );

      cy.then(function () {
        H.addOrUpdateDashboardCard({
          card_id: this.nestedQuestionId,
          dashboard_id: this.dashboardId,
          card: {
            parameter_mappings: [
              {
                parameter_id: idFilter.id,
                card_id: this.nestedQuestionId,
                target: ["dimension", ["field", PRODUCTS.ID, null]],
              },
            ],
          },
        });
      });
    });

    it("should lead you to a table question with filtered ID (metabase#17213)", () => {
      const productRecordId = 3;
      H.visitDashboard("@dashboardId", { params: { id: productRecordId } });

      H.getDashboardCard()
        .findByRole("link", { name: baseNestedQuestionDetails.name })
        .as("title");
      cy.get("@title").realHover();
      cy.get("@title").should("have.attr", "href").and("include", "/question#");
      cy.get("@title").click();

      H.appBar()
        .contains(`Started from ${baseNestedQuestionDetails.name}`)
        .should("be.visible");
      cy.findByTestId("question-row-count")
        .findByText("Showing 1 row")
        .should("be.visible");

      cy.findByTestId("object-detail").should("not.exist");
      cy.location("href").should("include", "/question#");
    });
  });

  describe("on various charts", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("titles become actual HTML anchors on focus and on hover", () => {
      H.createDashboardWithQuestions({
        dashboardName: "Dashboard with aggregated Q2",
        questions: [
          {
            name: "Line chart",
            display: "line",
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
              ],
              limit: 5,
            },
          },
          {
            name: "Row chart",
            display: "row",
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
              ],
              limit: 5,
            },
          },
          {
            name: "Map chart",
            display: "map",
            query: {
              "source-table": PEOPLE_ID,
              limit: 5,
            },
          },
          {
            name: "Funnel chart",
            display: "funnel",
            query: {
              "source-table": PEOPLE_ID,
              aggregation: [["count"]],
              breakout: [["field", PEOPLE.SOURCE]],
              limit: 5,
            },
          },
        ],
        cards: [
          { row: 0, col: 0, size_x: 6, size_y: 6 },
          { row: 0, col: 6, size_x: 6, size_y: 6 },
          { row: 6, col: 0, size_x: 6, size_y: 6 },
          { row: 6, col: 6, size_x: 6, size_y: 6 },
        ],
      }).then(({ dashboard, questions }) => {
        // Park the cursor off the grid before the dashcards render: a pointer
        // resting over a title computes that title's href before it is asserted.
        cy.get("body").realHover({ position: "topLeft" });

        H.visitDashboard(dashboard.id);
        H.waitForDashcardsToLoad({ count: 4 });

        H.getDashboardCard(0)
          .findByRole("link", { name: "Line chart" })
          .as("line-chart-title");
        H.getDashboardCard(1)
          .findByRole("link", { name: "Row chart" })
          .as("row-chart-title");
        H.getDashboardCard(2)
          .findByRole("link", { name: "Map chart" })
          .as("map-chart-title");
        H.getDashboardCard(3)
          .findByRole("link", { name: "Funnel chart" })
          .as("funnel-chart-title");

        const titles = [
          {
            elementAlias: "@line-chart-title",
            href: `/question/${questions[0].id}-line-chart`,
            trigger: focusTitle,
          },
          {
            elementAlias: "@row-chart-title",
            href: `/question/${questions[1].id}-row-chart`,
            trigger: focusTitle,
          },
          {
            elementAlias: "@map-chart-title",
            href: `/question/${questions[2].id}-map-chart`,
            trigger: hoverTitle,
          },
          {
            elementAlias: "@funnel-chart-title",
            href: `/question/${questions[3].id}-funnel-chart`,
            trigger: hoverTitle,
          },
        ];

        cy.log("every title is an inert placeholder before focus and hover");
        titles.forEach(({ elementAlias }) => {
          cy.get(elementAlias).should("have.attr", "href", "#");
        });

        cy.log("focusing or hovering a title turns it into a question anchor");
        titles.forEach(assertTitleBecomesQuestionAnchor);
      });
    });

    function focusTitle(element) {
      element.focus();
    }

    function hoverTitle(element) {
      const { MouseEvent } = element.ownerDocument.defaultView;
      element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    }

    /**
     * The question href is computed lazily on focus/mouseenter, and the anchor
     * is replaced when it resolves. Re-evaluating the trigger on each retry
     * keeps the assertion anchored to the node currently in the DOM.
     */
    function assertTitleBecomesQuestionAnchor({ elementAlias, href, trigger }) {
      cy.get(elementAlias).should(($el) => {
        trigger($el[0]);
        expect($el).to.have.attr("href", href);
      });
    }
  });

  describe("multiple series", () => {
    const question1Details = {
      name: "Q1",
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [["field", PEOPLE.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    };

    const question2Details = {
      name: "Q2",
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [["field", PEOPLE.BIRTH_DATE, { "temporal-unit": "year" }]],
      },
      display: "line",
    };

    const dateParameter = {
      id: "date",
      name: "Date",
      slug: "date",
      type: "date/all-options",
      default: "1970-01-01~2025-01-01",
    };

    const dashboardDetails = {
      parameters: [dateParameter],
    };

    function createMultiSeriesDashboard() {
      H.createQuestionAndDashboard({
        questionDetails: question1Details,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        H.createQuestion(question2Details).then(
          ({ body: { id: card_2_id } }) => {
            cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
              dashcards: [
                {
                  id,
                  card_id,
                  series: [{ id: card_2_id }],
                  row: 0,
                  col: 0,
                  size_x: 16,
                  size_y: 8,
                  parameter_mappings: [
                    {
                      parameter_id: dateParameter.id,
                      card_id,
                      target: ["dimension", ["field", PEOPLE.CREATED_AT, null]],
                    },
                    {
                      parameter_id: dateParameter.id,
                      card_id: card_2_id,
                      target: ["dimension", ["field", PEOPLE.BIRTH_DATE, null]],
                    },
                  ],
                },
              ],
            });
          },
        );
        H.visitDashboard(dashboard_id);
      });
    }

    beforeEach(() => {
      H.restore();
      cy.signInAsNormalUser();
    });

    it("should use parameters mapped to each card for a multi-series dashcard", () => {
      createMultiSeriesDashboard();

      cy.log("click on a dot in the second series and drill thru");
      H.cartesianChartCircle().eq(20).click();
      H.popover().findByText("See these People").click();

      cy.log("make sure the parameter mapping for the second series was used");
      H.queryBuilderFiltersPanel().within(() => {
        cy.findByText("Birth Date is Jan 1, 1970 – Jan 1, 2025").should(
          "be.visible",
        );
        cy.findByText(/Created At/).should("not.exist");
      });
    });
  });
});

describe("issue 29076", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as("cardQuery");

    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
          "create-queries": "no",
        },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });
    cy.sandboxTable({
      table_id: ORDERS_ID,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", ORDERS.ID, null]],
      },
    });
    cy.signInAsSandboxedUser();
  });

  it("should be able to drilldown to a saved question in a dashboard with sandboxing (metabase#29076)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.wait("@cardQuery");
    // test that user is sandboxed - normal users has over 2000 rows
    H.getDashboardCard()
      .findByTestId("table-body")
      .findAllByRole("row")
      .should("have.length", 1);

    cy.intercept("POST", "/api/card/*/query").as("questionQuery");
    H.getDashboardCard().findByRole("link", { name: "Orders" }).click();
    cy.wait("@questionQuery");

    cy.location("pathname").should(
      "eq",
      `/question/${ORDERS_QUESTION_ID}-orders`,
    );
    H.assertQueryBuilderRowCount(1); // test that user is sandboxed - normal users has over 2000 rows
    H.assertDatasetReqIsSandboxed({
      requestAlias: "@questionQuery",
      columnId: ORDERS.ID,
      columnAssertion: Number(USERS.sandboxed.login_attributes.attr_uid),
    });
  });
});

describe("issue 42165", () => {
  const peopleSourceFieldRef = [
    "field",
    PEOPLE.SOURCE,
    { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
  ];
  const ordersCreatedAtFieldRef = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime", "temporal-unit": "month" },
  ];

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");

    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [
          createMockParameter({
            id: "param-1",
            name: "Date",
            slug: "date",
            type: "date/all-options",
          }),
        ],
      },
      questions: [
        {
          name: "fooBarQuestion",
          display: "bar",
          query: {
            aggregation: [["count"]],
            breakout: [peopleSourceFieldRef, ordersCreatedAtFieldRef],
            "source-table": ORDERS_ID,
          },
        },
      ],
    }).then(({ dashboard: _dashboard }) => {
      cy.request("GET", `/api/dashboard/${_dashboard.id}`).then(
        ({ body: dashboard }) => {
          const [dashcard] = dashboard.dashcards;
          const [parameter] = dashboard.parameters;
          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            dashcards: [
              {
                ...dashcard,
                parameter_mappings: [
                  {
                    card_id: dashcard.card_id,
                    parameter_id: parameter.id,
                    target: ["dimension", ordersCreatedAtFieldRef],
                  },
                ],
              },
            ],
          }).then(() => {
            cy.wrap(_dashboard.id).as("dashboardId");
          });
        },
      );
    });
  });

  it("should use card name instead of series names when navigating to QB from dashcard title", () => {
    cy.get("@dashboardId").then((dashboardId) => {
      H.visitDashboard(dashboardId);
      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
        "filteredQuery",
      );

      H.filterWidget().click();
      H.popover().findByText("Previous 30 days").click();
      cy.wait("@filteredQuery");

      H.getDashboardCard(0).within(() => {
        cy.findAllByTestId("legend-item").should("have.length", 5);
        cy.findAllByTestId("legend-item")
          .first()
          .should("contain.text", "Affiliate");
        cy.findByText("fooBarQuestion").click();
      });

      cy.wait("@dataset");
      cy.title().should("eq", "fooBarQuestion · Metabase");
    });
  });
});

function drillThroughCardTitle(title) {
  cy.findByTestId("legend-caption").contains(title).click();
  cy.contains(`Started from ${title}`);
}

function checkFilterLabelAndValue(label, value) {
  H.filterWidget().findByLabelText(label, { exact: false }).should("exist");
  H.filterWidget().contains(value);
}

function checkScalarResult(result) {
  cy.findByTestId("scalar-value").invoke("text").should("eq", result);
}
