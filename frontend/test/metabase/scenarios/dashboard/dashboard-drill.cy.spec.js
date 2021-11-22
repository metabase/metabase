import {
  restore,
  modal,
  popover,
  filterWidget,
  showDashboardCardActions,
} from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATASET;

describe("scenarios > dashboard > dashboard drill", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should handle URL click through on a table", () => {
    createDashboardWithQuestion({}, dashboardId =>
      cy.visit(`/dashboard/${dashboardId}`),
    );
    cy.icon("pencil").click();
    showDashboardCardActions();
    cy.icon("click").click();

    // configure a URL click through on the  "MY_NUMBER" column
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Go to a custom destination").click();
    cy.findByText("URL").click();

    // set the url and text template
    modal().within(() => {
      cy.get("input")
        .first()
        .type("/foo/{{my_number}}/{{my_param}}", {
          parseSpecialCharSequences: false,
        });
      cy.get("input")
        .last()
        .type("column value: {{my_number}}", {
          parseSpecialCharSequences: false,
        });
      cy.findByText("Done").click();
    });

    cy.findByText("Save").click();

    setParamValue("My Param", "param-value");

    // click value and confirm url updates
    cy.findByText("column value: 111").click();
    cy.location("pathname").should("eq", "/foo/111/param-value");
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

        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );

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
          dashboardIdA => cy.visit(`/dashboard/${dashboardIdA}`),
        );
      },
    );

    cy.findAllByText("18")
      .first()
      .click();
    cy.location("pathname").should("eq", "/test/18/CO/Organic");
  });

  it("should handle question click through on a table", () => {
    createDashboardWithQuestion({}, dashboardId =>
      cy.visit(`/dashboard/${dashboardId}`),
    );
    cy.icon("pencil").click();
    showDashboardCardActions();
    cy.icon("click").click();

    // configure a dashboard target for the "MY_NUMBER" column
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Go to a custom destination").click();
    cy.findByText("Saved question").click();
    cy.findByText("Orders").click();
    cy.findByText("Orders → User ID").click();
    popover().within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Products → Category").click();
    popover().within(() => cy.findByText("My Param").click());

    // set the text template
    cy.findByPlaceholderText("E.x. Details for {{Column Name}}").type(
      "num: {{my_number}}",
      { parseSpecialCharSequences: false },
    );
    cy.findByText("Save").click();

    // wait to leave editing mode and set a param value
    cy.findByText("You're editing this dashboard.").should("not.exist");
    setParamValue("My Param", "Widget");

    // click on table value
    cy.findByText("num: 111").click();

    // show filtered question
    cy.findAllByText("Orders");
    cy.findByText("User ID is 111");
    cy.findByText("Category is Widget");
    cy.findByText("Showing 5 rows");
  });

  it("should handle dashboard click through on a table", () => {
    createQuestion({}, questionId => {
      createDashboard(
        { dashboardName: "start dash", questionId },
        dashboardIdA => {
          createDashboardWithQuestion(
            { dashboardName: "end dash" },
            dashboardIdB => {
              cy.visit(`/dashboard/${dashboardIdA}`);
            },
          );
        },
      );
    });
    cy.icon("pencil").click();
    showDashboardCardActions();
    cy.icon("click").click();

    // configure clicks on "MY_NUMBER to update the param
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Go to a custom destination").click();
    cy.findByText("Link to")
      .parent()
      .within(() => cy.findByText("Dashboard").click());
    modal().within(() => cy.findByText("end dash").click());
    cy.findByText("Available filters")
      .parent()
      .within(() => cy.findByText("My Param").click());
    popover().within(() => cy.findByText("MY_STRING").click());

    // set the text template
    cy.findByPlaceholderText("E.x. Details for {{Column Name}}").type(
      "text: {{my_string}}",
      { parseSpecialCharSequences: false },
    );
    cy.findByText("Save").click();

    // click on table value
    cy.findByText("text: foo").click();

    // check that param was set to "foo"
    cy.location("search").should("eq", "?my_param=foo");
    cy.findByText("My Param")
      .parent()
      .within(() => {
        cy.findByText("foo");
      });
  });

  // This was flaking. Example: https://dashboard.cypress.io/projects/a394u1/runs/2109/test-results/91a15b66-4b80-40bf-b569-de28abe21f42
  it.skip("should handle cross-filter on a table", () => {
    createDashboardWithQuestion({}, dashboardId =>
      cy.visit(`/dashboard/${dashboardId}`),
    );
    cy.icon("pencil").click();
    showDashboardCardActions();
    cy.icon("click").click();

    // configure clicks on "MY_NUMBER to update the param
    cy.findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => cy.findByText("MY_NUMBER").click());
    cy.findByText("Update a dashboard filter").click();
    cy.findByText("Pick one or more filters to update")
      .parent()
      .within(() => cy.findByText("My Param").click());
    popover().within(() => cy.findByText("MY_STRING").click());
    cy.findByText("Save").click();

    // click on table value
    cy.findByText("111").click();

    // check that param was set to "foo"
    cy.location("search").should("eq", "?my_param=foo");
    cy.findByText("My Param")
      .parent()
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
          cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
            cards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                sizeX: 8,
                sizeY: 6,
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
      cy.findByText("xavier").click();
      cy.findByText("=").click();

      cy.findByText("Reviewer is xavier");
      cy.findByText("Rating is equal to 2 selections");
      cy.contains("Reprehenderit non error"); // xavier's review
    });

    it("when clicking on the card title (metabase#13062-2)", () => {
      cy.findByText(questionDetails.name).click();
      cy.findByText("Rating is equal to 2 selections");
      cy.contains("Ad perspiciatis quis et consectetur."); // 5 star review
    });
  });

  it("should drill-through on a foreign key (metabase#8055)", () => {
    // In this test we're using already present dashboard ("Orders in a dashboard")
    const FILTER_ID = "7c9ege62";

    cy.log("Add filter (with the default Category) to the dashboard");
    cy.request("PUT", "/api/dashboard/1", {
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
    cy.request("PUT", "/api/dashboard/1/cards", {
      cards: [
        {
          id: 1,
          card_id: 1,
          row: 0,
          col: 0,
          sizeX: 12,
          sizeY: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: 1,
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
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    cy.visit("/dashboard/1");
    // Product ID in the first row (query fails for User ID as well)
    cy.findByText("105").click();
    cy.findByText("View details").click();

    cy.log("Reported on v0.29.3");
    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });
    cy.findByText("Fantastic Wool Shirt");
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

        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          cy.log("Connect dashboard filter to the question");

          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 14,
                sizeY: 10,
                series: [],
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
            ],
          });
        });
        cy.server();
        cy.route(
          "POST",
          `/api/dashboard/${DASHBOARD_ID}/card/${QUESTION_ID}/query`,
        ).as("cardQuery");

        cy.visit(`/dashboard/${DASHBOARD_ID}`);

        cy.wait("@cardQuery");
        cy.get(".bar")
          .eq(14) // August 2017 (Total of 12 reviews, 9 unique days)
          .click({ force: true });

        cy.wait("@cardQuery");
        cy.url().should("include", "2017-08");
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
        dashboardIdA => cy.visit(`/dashboard/${dashboardIdA}`),
      );
    });

    // formatting works, so we see "USD" in the table
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
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Add click through behavior to that question
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 10,
                sizeY: 6,
                series: [],
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
                parameter_mappings: [],
              },
            ],
          });
        });

        cy.visit(`/dashboard/${DASHBOARD_ID}`);
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
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

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
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Connect dashboard filter to the question
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 14,
                sizeY: 10,
                series: [],
                visualization_settings: {},
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
            ],
          });
        });
        // Set the filter to `previous 30 years` directly through the url
        cy.visit(`/dashboard/${DASHBOARD_ID}?date_filter=past30years`);
      });
    });
    cy.get(".Table-ID")
      .first()
      // Mid-point check that this cell actually contains ID = 1
      .contains("1")
      .click();

    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).to.not.exist;
    });
    cy.findByText("37.65");
    cy.findByText("No relationships found.");
  });

  it("should display correct tooltip value for multiple series charts on dashboard (metabase#15612)", () => {
    cy.createNativeQuestion({
      name: "15612_1",
      native: { query: "select 1 as axis, 5 as value" },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["AXIS"],
        "graph.metrics": ["VALUE"],
      },
    }).then(({ body: { id: QUESTION1_ID } }) => {
      cy.createNativeQuestion({
        name: "15612_2",
        native: { query: "select 1 as axis, 10 as value" },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["AXIS"],
          "graph.metrics": ["VALUE"],
        },
      }).then(({ body: { id: QUESTION2_ID } }) => {
        cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
          // Add the first question to the dashboard
          cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cardId: QUESTION1_ID,
          }).then(({ body: { id: DASH_CARD1_ID } }) => {
            cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cards: [
                {
                  id: DASH_CARD1_ID,
                  card_id: QUESTION1_ID,
                  row: 0,
                  col: 0,
                  sizeX: 12,
                  sizeY: 8,
                  series: [
                    {
                      id: QUESTION2_ID,
                    },
                  ],
                  visualization_settings: {},
                  parameter_mappings: [],
                },
              ],
            });
          });
          cy.intercept(
            "POST",
            `/api/dashboard/${DASHBOARD_ID}/card/${QUESTION2_ID}/query`,
          ).as("secondCardQuery");

          cy.visit(`/dashboard/${DASHBOARD_ID}`);
          cy.wait("@secondCardQuery");

          cy.get(".bar")
            .first()
            .trigger("mousemove");

          popover().within(() => {
            testPairedTooltipValues("AXIS", "1");
            testPairedTooltipValues("VALUE", "5");
          });

          cy.get(".bar")
            .last()
            .trigger("mousemove");

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
      cy.request("PUT", "/api/dashboard/1", {
        parameters,
      });

      // Connect those filters to the existing dashboard card
      cy.request("PUT", "/api/dashboard/1/cards", {
        cards: [
          {
            id: 1,
            card_id: 1,
            row: 0,
            col: 0,
            sizeX: 12,
            sizeY: 8,
            series: [],
            visualization_settings: {},
            parameter_mappings: [
              {
                parameter_id: ordersIdFilter.id,
                card_id: 1,
                target: ["dimension", ["field", ORDERS.ID, null]],
              },
              {
                parameter_id: productsIdFilter.id,
                card_id: 1,
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

      cy.visit("/dashboard/1");
    });

    it("should correctly drill-through on Orders filter (metabase#11503-1)", () => {
      setFilterValue(ordersIdFilter.name);

      drillThroughCardTitle("Orders");

      cy.findByText("37.65");
      cy.findByText("110.93");
      cy.findByText("52.72").should("not.exist");
      cy.findByText("Showing 2 rows");

      postDrillAssertion();
    });

    it("should correctly drill-through on Products filter (metabase#11503-2)", () => {
      setFilterValue(productsIdFilter.name);

      drillThroughCardTitle("Orders");

      cy.findByText("37.65").should("not.exist");
      cy.findAllByText("105.12");
      cy.findByText("Showing 191 rows");

      postDrillAssertion();
    });

    function setFilterValue(filterName) {
      filterWidget()
        .contains(filterName)
        .click();
      cy.findByPlaceholderText("Enter an ID").type("1,2,");
      cy.button("Add filter").click();
      cy.findByText("2 selections");
    }

    function postDrillAssertion() {
      cy.findByText("ID is 2 selections").click();
      popover().within(() => {
        cy.get("li")
          .should("have.length", 3) // The third one is an input field
          .and("contain", "1")
          .and("contain", "2");
        cy.findByText("Update filter");
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
      database: 1,
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

      cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
        cardId: questionId,
      }).then(({ body: { id: dashCardId } }) => {
        cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
          cards: [
            {
              id: dashCardId,
              card_id: questionId,
              row: 0,
              col: 0,
              sizeX: 6,
              sizeY: 6,
              parameter_mappings: [
                {
                  parameter_id: "e8f79be9",
                  card_id: questionId,
                  target: ["dimension", ["field", 22, { "source-field": 11 }]],
                },
              ],
              visualization_settings,
            },
          ],
        });

        callback(dashboardId);
      });
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
  cy.findByTestId("legend-caption")
    .contains(title)
    .click();
  cy.contains(`Started from ${title}`);
}

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1)
    .closest("td")
    .siblings("td")
    .findByText(val2);
}
