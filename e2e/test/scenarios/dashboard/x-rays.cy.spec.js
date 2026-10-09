const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

describe("scenarios > x-rays", { tags: "@slow" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  const XRAY_DATASETS = 5; // enough to load most questions

  it("should not display x-rays if the feature is disabled in admin settings (metabase#26571)", () => {
    const xrayCaption =
      "Try out these sample x-rays to see what Metabase can do.";

    cy.visit("/");
    cy.findByTestId("home-page").should("contain", xrayCaption);

    cy.request("PUT", "api/setting/enable-xrays", { value: false });
    cy.reload();

    cy.findByTestId("home-page").within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText(xrayCaption).should("not.exist");
      cy.findByText(/^A summary of/).should("not.exist");
      cy.findByText(/^A glance at/).should("not.exist");
      cy.findByText(/^A look at/).should("not.exist");
      cy.findByText(/^Some insights about/).should("not.exist");
    });
  });

  it("should x-ray questions from a chart click (metabase#13112, metabase#31697, metabase#23820)", () => {
    cy.log("x-ray a question with explicit joins (metabase#13112)");
    const PRODUCTS_ALIAS = "Products";

    H.createQuestion(
      {
        name: "13112",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": PRODUCTS_ALIAS }],
              ],
              alias: PRODUCTS_ALIAS,
            },
          ],
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", PRODUCTS.CATEGORY, { "join-alias": PRODUCTS_ALIAS }],
          ],
        },
        display: "line",
      },
      { visitQuestion: true },
    );

    cy.intercept("POST", "/api/dataset").as("dataset");

    H.cartesianChartCircle()
      .eq(23) // Random dot
      .click({ force: true });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Automatic insights…").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("X-ray").click();

    // x-rays take long time even locally - that can timeout in CI so we have to extend it
    cy.wait("@dataset", { timeout: 30000 });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "A closer look at number of Orders where Created At is in March 2027 and Category is Gadget",
    );
    H.dashboardGrid().findAllByTestId("dashcard").should("have.length.gt", 1);
    cy.icon("warning").should("not.exist");

    cy.log("x-ray a question filtered by a segment (metabase#31697)");
    H.createSegment({
      name: "Orders segment",
      description: "All orders with a total under $100.",
      definition: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      },
    }).then(({ body: segment }) => {
      H.createQuestion(
        {
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            filter: ["segment", segment.id],
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          visualization_settings: {
            "graph.metrics": ["count"],
            "graph.dimensions": ["CREATED_AT"],
          },
        },
        { visitQuestion: true },
      );
    });

    cy.intercept("GET", "/api/automagic-dashboards/**").as("xrayDashboard");
    H.cartesianChartCircle().eq(0).click();
    H.popover().findByText("Automatic insights…").click();
    H.popover().findByText("X-ray").click();
    cy.wait("@xrayDashboard");

    cy.findByRole("main").within(() => {
      cy.findByText(/A closer look at number of Orders/).should("be.visible");
    });

    cy.log(
      "x-ray a question with a day-of-week breakout and a null semantic type (metabase#23820)",
    );
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });
    H.createQuestion(
      {
        name: "23820",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "day-of-week" }],
          ],
        },
        display: "line",
      },
      { visitQuestion: true },
    );

    cy.intercept("POST", "/api/dataset").as("dataset");

    H.cartesianChartCircle()
      .eq(3) // Wednesday
      .click();

    H.popover().within(() => {
      cy.findByText("Automatic insights…").click();
      cy.findByText("X-ray").click();
    });

    cy.wait("@dataset");

    H.main().within(() => {
      cy.findByText(
        "A closer look at number of Orders where day of week of Created At is Wednesday",
      ).should("be.visible");
    });

    getDashcardByTitle("A look at Created At fields").should("exist");

    getDashcardByTitle("A look at the number of Orders").should("exist");
  });

  it("should x-ray and compare a nested question made from base native question (metabase#15655)", () => {
    H.createNativeQuestion({
      name: "15655",
      native: { query: "select * from people" },
    }).then(({ body: { id } }) => {
      H.createQuestion(
        {
          name: "Count of 15655 by SOURCE",
          display: "bar",
          query: {
            "source-table": `card__${id}`,
            aggregation: [["count"]],
            breakout: [["field", "SOURCE", { "base-type": "type/Text" }]],
          },
        },
        { visitQuestion: true },
      );
    });

    ["X-ray", "Compare to the rest"].forEach((action, index) => {
      cy.log(action);
      if (index > 0) {
        cy.go("back");
        cy.url().should("include", "/question");
        H.queryBuilderHeader().should("be.visible");
      }

      cy.intercept("GET", "/api/automagic-dashboards/**").as("xray");
      cy.intercept("POST", "/api/dataset").as("postDataset");

      H.chartPathWithFillColor("#509EE3").first().click({ force: true });

      H.popover().within(() => {
        cy.findByText("Automatic insights…").click();
        cy.findByText(action).click();
      });

      cy.wait(Array(XRAY_DATASETS).fill("@postDataset"), {
        timeout: 15 * 1000,
      });
      cy.wait("@xray").its("response.statusCode").should("eq", 200);

      H.main().within(() => {
        cy.findByText("A look at the number of 15655").should("exist");
      });

      cy.findAllByTestId("dashcard-container");
    });
  });

  it("should not show NULL in titles of generated dashboard cards (metabase#15737)", () => {
    H.visitQuestionAdhoc({
      name: "15737",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.SOURCE, null]],
        },
        type: "query",
      },
      display: "bar",
    });

    [
      { action: "X-ray", title: "Source is Affiliate" },
      {
        action: "Compare to the rest",
        title: "Comparison of Number of People by Source and People",
      },
    ].forEach(({ action, title }, index) => {
      cy.log(action);
      if (index > 0) {
        cy.go("back");
        cy.url().should("include", "/question");
        H.queryBuilderHeader().should("be.visible");
      }

      cy.intercept("GET", "/api/automagic-dashboards/**").as("xray");

      H.chartPathWithFillColor("#509EE3").first().click();

      H.popover().within(() => {
        cy.findByText("Automatic insights…").click();
        cy.findByText(action).click();
      });
      cy.wait("@xray");

      H.main().should("contain", title);
      cy.contains("null").should("not.exist");
    });
  });

  it("should start loading cards from top to bottom", () => {
    // to check the order of loaded cards this test lets the first intercepted
    // request to be resolved successfully and then it fails all others

    const totalRequests = 8;
    const successfullyLoadedCards = 1;
    const failedCards = totalRequests - successfullyLoadedCards;

    // Cypress runs the newest matching intercept first, so the stub for the
    // failed requests is registered before the pass-through for the first one
    cy.intercept(
      { method: "POST", url: "/api/dataset", times: failedCards },
      { statusCode: 500 },
    ).as("datasetFailed");

    cy.intercept(
      { method: "POST", url: "/api/dataset", times: successfullyLoadedCards },
      (req) => req.continue(),
    ).as("dataset");

    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);

    cy.wait("@dataset");
    cy.wait("@datasetFailed");

    getDashcardByTitle("Total transactions")
      .findByText("18,760")
      .should("be.visible");
    getDashcardByTitle("Transactions in the last 30 days")
      .icon("warning")
      .should("be.visible");
  });

  // TODO - this is a legitimate failure because `param_fields` are not returned for x-ray dashboards
  it("should be able to click the title of an x-ray dashcard to see it in the query builder (metabase#19405)", () => {
    const timeout = { timeout: 10000 };

    cy.intercept("GET", "/app/assets/geojson/**").as("geojson");
    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);
    cy.wait("@geojson", { timeout });

    // confirm results of "Total transactions" card are present
    getDashcardByTitle("Total transactions").findByText("18,760", timeout);
    H.dashboardGrid().findByText("Total transactions").click();

    // confirm we're in the query builder with the same results
    cy.url().should("contain", "/question");
    H.queryBuilderMain().findByText("18,760");

    cy.log("return with the back to the x-ray button");
    H.queryBuilderHeader()
      .findByLabelText(/Back to .*Orders.*/)
      .click();
    getDashcardByTitle("Total transactions")
      .findByText("18,760", timeout)
      .should("be.visible");

    cy.log("return with the browser back button");
    H.dashboardGrid().findByText("Total transactions").click();
    H.queryBuilderMain().findByText("18,760");
    cy.go("back");

    // add a parameter filter to the auto dashboard
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("State", timeout).click();

    cy.findByPlaceholderText("Search the list").type("GA{enter}");
    cy.findByLabelText("GA").should("be.visible").click();
    cy.button("Add filter").click();

    // confirm results of "Total transactions" card were updated
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("463", timeout);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Total transactions").click();

    // confirm parameter filter is applied as filter in query builder
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User → State is GA");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("463");
  });

  it("should correctly apply breakout in query builder (metabase#14648)", () => {
    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);

    getDashcardByTitle("Total transactions")
      .findByText("18,760", { timeout: 30000 })
      .click();

    H.popover().within(() => {
      cy.findByText("Break out by…").click();
      cy.findByText("Category").click();
      cy.findByText("Source").click();
    });

    cy.url().should("contain", "/question");

    // Bars
    H.chartPathWithFillColor("#509EE3").should("have.length", 5);
    H.ensureChartIsActive();
    H.chartPathWithFillColor("#509EE3").eq(0).realHover();

    H.assertEChartsTooltip({
      header: "Affiliate",
      rows: [
        {
          color: "#509EE3",
          name: "Count",
          value: "3,520",
        },
      ],
    });

    H.openVizSettingsSidebar();
    cy.findAllByTestId("chartsettings-field-picker")
      .findByDisplayValue("User → Source")
      .should("be.visible");
  });

  it("should be able to open x-ray on a dashcard from a dashboard with multiple tabs", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    return H.createDashboard({ name: "my dashboard" }).then(
      ({ body: { id: dashboard_id } }) => {
        H.addOrUpdateDashboardCard({
          card_id: ORDERS_BY_YEAR_QUESTION_ID,
          dashboard_id,
          card: {
            row: 0,
            col: 0,
            size_x: 24,
            size_y: 10,
            visualization_settings: {},
          },
        });
        H.visitDashboardAndCreateTab({
          dashboardId: dashboard_id,
          save: false,
        });
        cy.findByRole("tab", { name: "Tab 1" }).click();
        H.saveDashboard();

        H.cartesianChartCircle().eq(0).click({ force: true });
        H.popover().findByText("Automatic insights…").click();
        H.popover().findByText("X-ray").click();
        cy.wait("@dataset", { timeout: 60000 });

        // Ensure charts actually got rendered
        cy.url().should("include", "/auto/dashboard/");
        H.main()
          .findByText(
            /^A closer look at number of Orders where year of Created At is between/,
          )
          .should("be.visible");
        H.dashboardGrid().find("text").contains("Created At");
      },
    );
  });

  it("should render all cards of a table x-ray and save it as a dashboard (metabase#48519, metabase#18028)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);
    // There're 8 questions on the Orders x-ray dashboard
    cy.wait(Array(8).fill("@dataset"), { timeout: 60 * 1000 });

    getDashcardByTitle("Total transactions")
      .findByText("18,760")
      .should("exist");
    getDashcardByTitle("Transactions in the last 30 days")
      .findByTestId("scalar-value")
      .should("exist"); // not asserting a value as it's dynamic
    getDashcardByTitle("Average quantity per month").within(() => {
      cy.findByText("Average of Quantity").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });
    getDashcardByTitle("Sales per source").within(() => {
      cy.findByText("Organic").should("exist");
      cy.findByText("Affiliate").should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });
    getDashcardByTitle("Sales per product").within(() => {
      cy.findByText("Product → Title").should("exist");
      cy.findByText("Aerodynamic Bronze Hat").should("exist");
    });
    getDashcardByTitle("Sales for each product category").within(() => {
      cy.findByText("Product → Category").should("exist");
      cy.findByText("Doohickey").should("exist");
      cy.findByText("Count").should("exist");
    });
    getDashcardByTitle("Sales per state")
      .findAllByTestId("choropleth-feature")
      .should("have.length", 50); // 50 states
    getDashcardByTitle("Sales by coordinates")
      .findByText("Leaflet")
      .should("exist");

    // x-ray dashboards should default to 'fixed' width
    cy.findByTestId("fixed-width-dashboard-header").should(
      "have.css",
      "max-width",
      "1048px",
    );
    cy.findByTestId("fixed-width-filters").should(
      "have.css",
      "max-width",
      "1048px",
    );
    cy.findByTestId("dashboard-grid").should("have.css", "max-width", "1048px");

    cy.log("save the x-ray and visit it immediately (metabase#18028)");
    cy.button("Save this").click();

    cy.log(
      "'See it' link should be displayed both in the header and in the toast",
    );
    H.undoToast()
      .should("contain", "Your dashboard was saved")
      .and("contain", "See it");

    cy.findByTestId("automatic-dashboard-header").within(() => {
      cy.findByRole("link", { name: "See it" }).should("be.visible").click();
    });

    cy.url().should("contain", "a-look-at-orders");

    cy.findAllByTestId("dashcard").contains("18,760");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("How these transactions are distributed");

    H.openNavigationSidebar();

    H.navigationSidebar()
      .findByRole("link", { name: /Automatically generated dashboards/i })
      .should("exist");
  });
});

function getDashcardByTitle(title) {
  return H.dashboardGrid()
    .findByText(title)
    .closest("[data-testid='dashcard']");
}
