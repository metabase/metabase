import {
  addOrUpdateDashboardCard,
  assertQueryBuilderRowCount,
  filterWidget,
  getDashboardCard,
  main,
  modal,
  popover,
  restore,
  showDashboardCardActions,
  sidebar,
  visitDashboard,
  queryBuilderHeader,
  queryBuilderMain,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
} = SAMPLE_DATABASE;

describe("scenarios > dashboard > dashboard drill", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should handle URL click through on a table", () => {
    createDashboardWithQuestion({}, dashboardId => {
      visitDashboard(dashboardId);

      cy.findByTestId("dashboard-header").icon("pencil").click();
      showDashboardCardActions();
      cy.findByTestId("dashboardcard-actions-panel").icon("click").click();

      // configure a URL click through on the  "MY_NUMBER" column
      sidebar()
        .findByText("On-click behavior for each column")
        .parent()
        .parent()
        .within(() => cy.findByText("MY_NUMBER").click());
      cy.findByText("Go to a custom destination").click();
      cy.findByText("URL").click();

      // set the url and text template
      modal().within(() => {
        cy.get("input").first().type("/foo/{{my_number}}/{{my_param}}", {
          parseSpecialCharSequences: false,
        });
        cy.get("input").last().type("column value: {{my_number}}", {
          parseSpecialCharSequences: false,
        });
        cy.findByText("Done").click();
      });

      cy.findByTestId("edit-bar").findByText("Save").click();

      setParamValue("My Param", "param-value");
      // click value and confirm url updates

      getDashboardCard().findByText("column value: 111").click();
      cy.location("pathname").should("eq", "/foo/111/param-value");
    });
  });

  it("should insert values from hidden column on custom destination URL click through (metabase#13927)", () => {
    const questionDetails = {
      name: "13927",
      native: { query: "SELECT PEOPLE.STATE, PEOPLE.CITY from PEOPLE;" },
    };

    const clickBehavior = {
      "table.cell_column": "CITY",
      "table.pivot_column": "STATE",
      column_settings: {
        '["name","CITY"]': {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTextTemplate:
              "Click to find out which state does {{CITY}} belong to.",
            linkTemplate: "/test/{{STATE}}",
          },
        },
      },
      "table.columns": [
        {
          name: "STATE",
          fieldRef: ["field", "STATE", { "base-type": "type/Text" }],
          enabled: false,
        },
        {
          name: "CITY",
          fieldRef: ["field", "CITY", { "base-type": "type/Text" }],
          enabled: true,
        },
      ],
    };

    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id } = dashboardCard;

        cy.editDashboardCard(dashboardCard, {
          visualization_settings: clickBehavior,
        });

        visitDashboard(dashboard_id);
      },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Click to find out which state does Rye belong to.").click();

    cy.log("Reported failing on v0.37.2");
    cy.location("pathname").should("eq", "/test/CO");
  });

  it("should insert data from the correct row in the URL for pivot tables (metabase#17920)", () => {
    const query =
      "SELECT STATE, SOURCE, COUNT(*) AS CNT from PEOPLE GROUP BY STATE, SOURCE";
    const questionSettings = {
      "table.pivot": true,
      "table.pivot_column": "SOURCE",
      "table.cell_column": "CNT",
    };
    const columnKey = JSON.stringify(["name", "CNT"]);
    const dashCardSettings = {
      column_settings: {
        [columnKey]: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "/test/{{CNT}}/{{STATE}}/{{SOURCE}}",
          },
        },
      },
    };
    createQuestion(
      { query, visualization_settings: questionSettings },
      questionId => {
        createDashboard(
          { questionId, visualization_settings: dashCardSettings },
          dashboardIdA => visitDashboard(dashboardIdA),
        );
      },
    );

    cy.findAllByText("18").first().click();
    cy.location("pathname").should("eq", "/test/18/CO/Organic");
  });

  it("should handle question click through on a table", () => {
    createDashboardWithQuestion({}, dashboardId => visitDashboard(dashboardId));

    cy.findByLabelText("Edit dashboard").click();
    showDashboardCardActions();
    cy.findByLabelText("Click behavior").click();

    sidebar().within(() => {
      // Configuring on-click behavior for MY_NUMBER column
      cy.findByText("MY_NUMBER").click();
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
    });

    modal().findByText("Orders").click();

    sidebar().findByText("Orders → User ID").click();
    popover().findByText("MY_NUMBER").click();

    sidebar().findByText("Products → Category").click();
    popover().findByText("My Param").click();

    sidebar()
      .findByLabelText(/Customize link text/)
      .type("num: {{my_number}}", {
        parseSpecialCharSequences: false,
      });

    cy.findByTestId("edit-bar").button("Save").click();

    // wait to leave editing mode and set a param value
    main().findByText("You're editing this dashboard.").should("not.exist");
    setParamValue("My Param", "Widget");

    // click on table value
    cy.findByTestId("dashcard").findByText("num: 111").click();

    queryBuilderHeader().findByText("Orders").should("be.visible");
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("User ID is 111").should("be.visible");
      cy.findByText("Product → Category is Widget").should("be.visible");
    });
    assertQueryBuilderRowCount(5);
  });

  it("should handle dashboard click through on a table", () => {
    createQuestion({}, questionId => {
      createDashboard(
        { dashboardName: "start dash", questionId },
        dashboardIdA => {
          createDashboardWithQuestion(
            { dashboardName: "end dash" },
            dashboardIdB => {
              visitDashboard(dashboardIdA);
            },
          );
        },
      );
    });
    cy.icon("pencil").click();
    showDashboardCardActions();
    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("click").click();
    });

    // configure clicks on "MY_NUMBER to update the param
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      .within(() => cy.findByText("MY_NUMBER").click());
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Go to a custom destination").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Link to")
      .parent()
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      .within(() => cy.findByText("Dashboard").click());
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    modal().within(() => cy.findByText("end dash").click());
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Available filters")
      .parent()
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      .within(() => cy.findByText("My Param").click());
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("MY_STRING").click());

    // set the text template
    cy.findByPlaceholderText("E.x. Details for {{Column Name}}").type(
      "text: {{my_string}}",
      { parseSpecialCharSequences: false },
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    // click on table value
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("text: foo").click();

    // check that param was set to "foo"
    cy.location("search").should("eq", "?my_param=foo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("My Param")
      .parent()
      .within(() => {
        cy.findByText("foo");
      });
  });

  it("should open the same dashboard when a custom URL click behavior points to the same dashboard (metabase#22702)", () => {
    createDashboardWithQuestion({}, dashboardId => {
      visitDashboard(dashboardId);
      cy.icon("pencil").click();
      showDashboardCardActions();
      cy.findByTestId("dashboardcard-actions-panel").within(() => {
        cy.icon("click").click();
      });

      cy.findByText("On-click behavior for each column")
        .parent()
        .parent()
        .within(() => cy.findByText("MY_NUMBER").click());
      cy.findByText("Go to a custom destination").click();
      cy.findByText("URL").click();

      modal().within(() => {
        cy.get("input")
          .first()
          .type(`/dashboard/${dashboardId}?my_param=Aaron Hand`);
        cy.get("input").last().type("Click behavior");
        cy.findByText("Done").click();
      });

      cy.findByText("Save").click();

      cy.findByText("Click behavior").click();

      cy.location("pathname").should("eq", `/dashboard/${dashboardId}`);
      cy.location("search").should("eq", "?my_param=Aaron%20Hand");
    });
  });

  // This was flaking. Example: https://dashboard.cypress.io/projects/a394u1/runs/2109/test-results/91a15b66-4b80-40bf-b569-de28abe21f42
  it.skip("should handle cross-filter on a table", () => {
    createDashboardWithQuestion({}, dashboardId => visitDashboard(dashboardId));
    cy.icon("pencil").click();
    showDashboardCardActions();
    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("click").click();
    });

    // configure clicks on "MY_NUMBER to update the param
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      .within(() => cy.findByText("MY_NUMBER").click());
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Update a dashboard filter").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick one or more filters to update")
      .parent()
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      .within(() => cy.findByText("My Param").click());
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("MY_STRING").click());
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    // click on table value
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("111").click();

    // check that param was set to "foo"
    cy.location("search").should("eq", "?my_param=foo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("My Param")
      .parent()
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      .within(() => cy.findByText("foo"));
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

      cy.createQuestionAndDashboard({ questionDetails }).then(
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

    it("when clicking on the field value (metabase#13062-1)", () => {
      cy.findByTestId("dashcard").findByText("xavier").click();
      popover().findByText("Is xavier").click();

      cy.findByTestId("qb-filters-panel").within(() => {
        cy.findByText("Reviewer is xavier").should("be.visible");
        cy.findByText("Rating is equal to 2 selections").should("be.visible");
      });

      // xavier's review
      queryBuilderMain()
        .contains("Reprehenderit non error")
        .should("be.visible");

      assertQueryBuilderRowCount(1);
    });

    it("when clicking on the card title (metabase#13062-2)", () => {
      cy.findByTestId("dashcard").findByText(questionDetails.name).click();
      cy.findByTestId("qb-filters-panel")
        .findByText("Rating is equal to 2 selections")
        .should("be.visible");

      // Sample review body
      queryBuilderMain()
        .contains("Ad perspiciatis quis et consectetur.")
        .should("be.visible");

      assertQueryBuilderRowCount(907);
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

    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findAllByTestId("column-header").contains("ID").click().click();

    cy.get(".Table-ID").contains(PK_VALUE).first().click();

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

    visitDashboard(ORDERS_DASHBOARD_ID);
    // Product ID in the first row (query fails for User ID as well)
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("105").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("View details").click();

    cy.log("Reported on v0.29.3");
    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });
    cy.findByTestId("object-detail").findByText("Fantastic Wool Shirt");
  });

  it("should apply correct date range on a graph drill-through (metabase#13785)", () => {
    cy.log("Create a question");

    cy.createQuestion({
      name: "13785",
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["count"]],
        breakout: [["field", REVIEWS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "bar",
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
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
        addOrUpdateDashboardCard({
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

        visitDashboard(DASHBOARD_ID);

        cy.intercept(
          "POST",
          `/api/dashboard/${DASHBOARD_ID}/dashcard/*/card/${QUESTION_ID}/query`,
        ).as("cardQuery");

        cy.get(".bar")
          .eq(14) // August 2023 (Total of 12 reviews, 9 unique days)
          .click({ force: true });

        cy.wait("@cardQuery");
        cy.url().should("include", "2023-08");
        cy.get(".bar").should("have.length", 1);
        // Since hover doesn't work in Cypress we can't assert on the popover that's shown when one hovers the bar
        // But when this issue gets fixed, Y-axis should definitely show "12" (total count of reviews)
        cy.get(".axis.y").contains("12");
      });
    });
  });

  it("should not hide custom formatting when click behavior is enabled (metabase#14597)", () => {
    const columnKey = JSON.stringify(["name", "MY_NUMBER"]);
    const questionSettings = {
      column_settings: {
        [columnKey]: {
          number_style: "currency",
          currency_style: "code",
          currency_in_header: false,
        },
      },
    };
    const dashCardSettings = {
      column_settings: {
        [columnKey]: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "/it/worked",
          },
        },
      },
    };

    createQuestion({ visualization_settings: questionSettings }, questionId => {
      createDashboard(
        { questionId, visualization_settings: dashCardSettings },
        dashboardIdA => visitDashboard(dashboardIdA),
      );
    });

    // formatting works, so we see "USD" in the table
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("USD 111.00").click();
    cy.location("pathname").should("eq", "/it/worked");
  });

  it("should not remove click behavior on 'reset to defaults' (metabase#14919)", () => {
    const LINK_NAME = "Home";

    cy.createQuestion({
      name: "14919",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
        // Add previously added question to the dashboard
        addOrUpdateDashboardCard({
          card_id: QUESTION_ID,
          dashboard_id: DASHBOARD_ID,
          card: {
            // Add click through behavior to that question
            visualization_settings: {
              column_settings: {
                [`["ref",["field-id",${PRODUCTS.CATEGORY}]]`]: {
                  click_behavior: {
                    type: "link",
                    linkType: "url",
                    linkTemplate: "/",
                    linkTextTemplate: LINK_NAME,
                  },
                },
              },
            },
          },
        });

        visitDashboard(DASHBOARD_ID);
        cy.icon("pencil").click();
        // Edit "Visualization options"
        showDashboardCardActions();
        cy.icon("palette").click();
        cy.get(".Modal").within(() => {
          cy.findByText("Reset to defaults").click();
          cy.button("Done").click();
        });
        // Save the whole dashboard
        cy.button("Save").click();
        cy.findByText("You're editing this dashboard.").should("not.exist");
        cy.log("Reported failing on v0.38.0 - link gets dropped");
        cy.get(".DashCard").findAllByText(LINK_NAME);
      });
    });
  });

  it('should drill-through on PK/FK to the "object detail" when filtered by explicit joined column (metabase#15331)', () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.createQuestion({
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
      cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
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
        addOrUpdateDashboardCard({
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
    cy.findByTextEnsureVisible("Quantity");
    cy.get(".Table-ID")
      .first()
      // Mid-point check that this cell actually contains ID = 1
      .contains("3")
      .click();

    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).to.not.exist;
    });
    cy.findByTestId("object-detail");
    cy.findAllByText("37.65");
  });

  it("should display correct tooltip value for multiple series charts on dashboard (metabase#15612)", () => {
    cy.createNativeQuestion({
      name: "15612_1",
      native: { query: 'select 1 as AXIS, 5 as "VALUE"' },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["AXIS"],
        "graph.metrics": ["VALUE"],
      },
    }).then(({ body: { id: QUESTION1_ID } }) => {
      cy.createNativeQuestion({
        name: "15612_2",
        native: { query: 'select 1 as AXIS, 10 as "VALUE"' },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["AXIS"],
          "graph.metrics": ["VALUE"],
        },
      }).then(({ body: { id: QUESTION2_ID } }) => {
        cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
          // Add the first question to the dashboard
          addOrUpdateDashboardCard({
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

          visitDashboard(DASHBOARD_ID);

          cy.get(".bar").first().trigger("mousemove");

          popover().within(() => {
            testPairedTooltipValues("AXIS", "1");
            testPairedTooltipValues("VALUE", "5");
          });

          cy.get(".bar").last().trigger("mousemove");

          popover().within(() => {
            testPairedTooltipValues("AXIS", "1");
            testPairedTooltipValues("VALUE", "10");
          });
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

      visitDashboard(ORDERS_DASHBOARD_ID);
    });

    it("should correctly drill-through on Orders filter (metabase#11503-1)", () => {
      setFilterValue(ordersIdFilter.name);

      drillThroughCardTitle("Orders");

      queryBuilderMain().within(() => {
        cy.findByText("37.65").should("be.visible");
        cy.findByText("110.93").should("be.visible");
        cy.findByText("52.72").should("not.exist");
      });

      assertQueryBuilderRowCount(2);

      postDrillAssertion("ID is 2 selections");
    });

    it("should correctly drill-through on Products filter (metabase#11503-2)", () => {
      setFilterValue(productsIdFilter.name);

      drillThroughCardTitle("Orders");
      queryBuilderMain().within(() => {
        cy.findByText("37.65").should("not.exist");
        cy.findAllByText("105.12").should("have.length", 17);
      });

      assertQueryBuilderRowCount(191);

      postDrillAssertion("Product → ID is 2 selections");
    });

    function setFilterValue(filterName) {
      filterWidget().contains(filterName).click();
      cy.findByPlaceholderText("Enter an ID").type("1,2,");
      cy.button("Add filter").click();
      cy.findByText("2 selections");
    }

    function postDrillAssertion(filterName) {
      cy.findByTestId("qb-filters-panel").findByText(filterName).click();
      popover().within(() => {
        cy.get(".input").should("contain", "1").and("contain", "2");
        cy.button("Update filter").should("be.visible");
      });
    }
  });
});

function createDashboardWithQuestion(
  { dashboardName = "dashboard" } = {},
  callback,
) {
  createQuestion({}, questionId => {
    createDashboard({ dashboardName, questionId }, callback);
  });
}

function createQuestion(options, callback) {
  cy.request("POST", "/api/card", {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native",
      native: {
        query: options.query || "select 111 as my_number, 'foo' as my_string",
      },
    },
    display: "table",
    visualization_settings: options.visualization_settings || {},
    name: "Question",
    collection_id: null,
  }).then(({ body: { id: questionId } }) => {
    callback(questionId);
  });
}

function createDashboard(
  { dashboardName = "dashboard", questionId, visualization_settings },
  callback,
) {
  cy.createDashboard({ name: dashboardName }).then(
    ({ body: { id: dashboardId } }) => {
      cy.request("PUT", `/api/dashboard/${dashboardId}`, {
        parameters: [
          {
            name: "My Param",
            slug: "my_param",
            id: "e8f79be9",
            type: "category",
          },
        ],
      });

      addOrUpdateDashboardCard({
        card_id: questionId,
        dashboard_id: dashboardId,
        card: {
          parameter_mappings: [
            {
              parameter_id: "e8f79be9",
              card_id: questionId,
              target: [
                "dimension",
                ["field", PEOPLE.NAME, { "source-field": ORDERS.USER_ID }],
              ],
            },
          ],
          visualization_settings,
        },
      }).then(() => callback(dashboardId));
    },
  );
}

function setParamValue(paramName, text) {
  // wait to leave editing mode and set a param value
  cy.findByText("You're editing this dashboard.").should("not.exist");
  cy.findByText(paramName).click();
  popover().within(() => {
    cy.findByPlaceholderText("Search by Name").type(text);
    cy.findByText("Add filter").click();
  });
}

function drillThroughCardTitle(title) {
  cy.findByTestId("legend-caption").contains(title).click();
  cy.contains(`Started from ${title}`);
}

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1).closest("td").siblings("td").findByText(val2);
}
