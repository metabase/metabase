const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { defer } from "metabase/utils/promise";
const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID, FEEDBACK, FEEDBACK_ID } =
  SAMPLE_DATABASE;

describe("locked parameters in embedded question (metabase#20634)", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("publishChanges");

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(
      {
        name: "20634",
        native: {
          query: "select {{text}}",
          "template-tags": {
            text: {
              id: "abc-123",
              name: "text",
              "display-name": "Text",
              type: "text",
              default: null,
            },
          },
        },
      },
      {
        visitQuestion: true,
        wrapId: true,
      },
    );
  });

  it("should let the user lock parameters to specific values", () => {
    cy.get("@questionId").then((questionId) => {
      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: questionId,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });

    H.modal().within(() => {
      // open the visibility dropdown for the Text parameter so that we can set the value to "Locked"
      cy.findByLabelText("Text").click();
    });

    H.selectDropdown().findByText("Locked").click();

    H.modal().within(() => {
      // set a parameter value
      cy.findByPlaceholderText("Text").type("foo{enter}");

      // publish the embedded question so that we can directly navigate to its url
      cy.findByText("Publish changes").click();
      cy.wait("@publishChanges");
    });

    // directly navigate to the embedded question
    H.visitIframe();

    // verify that the Text parameter doesn't show up but that its value is reflected in the dashcard
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Text").should("not.exist");
    cy.get(".CardVisualization").within(() => {
      cy.contains("foo");
    });
  });
});

// TODO:
// - Add tests for embedding previews in both cases
// - Add tests for disabled, editable and locked parameters in both cases
// BONUS: Ideally add tests for email subscriptions with the filter applied
describe("issue 27643", { tags: "@external" }, () => {
  const PG_DB_ID = 2;
  const TEMPLATE_TAG_NAME = "expected_invoice";
  const getQuestionDetails = (fieldId) => {
    return {
      name: "27643",
      database: PG_DB_ID,
      native: {
        query:
          "SELECT * FROM INVOICES [[ where {{ expected_invoice }} ]] limit 1",
        "template-tags": {
          [TEMPLATE_TAG_NAME]: {
            id: "3cfb3686-0d13-48db-ab5b-100481a3a830",
            dimension: ["field", fieldId, null],
            name: TEMPLATE_TAG_NAME,
            "display-name": "Expected Invoice",
            type: "dimension",
            "widget-type": "string/=",
          },
        },
      },
      enable_embedding: true,
      embedding_params: {
        [TEMPLATE_TAG_NAME]: "enabled",
      },
    };
  };

  beforeEach(() => {
    // This issue was only reproducible against the Postgres database.
    H.restore("postgres-12");
    cy.signInAsAdmin();
    H.withDatabase(PG_DB_ID, ({ INVOICES }) => {
      cy.wrap(INVOICES.EXPECTED_INVOICE).as(
        "postgresInvoicesExpectedInvoiceId",
      );
    });
  });

  describe("should allow a dashboard filter to map to a boolean field filter parameter (metabase#27643)", () => {
    beforeEach(() => {
      const dashboardParameter = {
        id: "2850aeab",
        name: "Text filter for boolean field",
        slug: "text_filter_for_boolean_field",
        type: "string/=",
      };

      const dashboardDetails = {
        name: "Dashboard with card with boolean field filter",
        enable_embedding: true,
        embedding_params: {
          [dashboardParameter.slug]: "enabled",
        },
        parameters: [dashboardParameter],
      };

      cy.get("@postgresInvoicesExpectedInvoiceId")
        .then((fieldId) => {
          H.createNativeQuestionAndDashboard({
            questionDetails: getQuestionDetails(fieldId),
            dashboardDetails,
          });
        })
        .then(({ body: dashboardCard }) => {
          const { card_id, dashboard_id } = dashboardCard;

          cy.wrap(dashboard_id).as("dashboardId");
          cy.wrap(card_id).as("questionId");

          const mapFilterToCard = {
            parameter_mappings: [
              {
                parameter_id: dashboardParameter.id,
                card_id,
                target: ["dimension", ["template-tag", TEMPLATE_TAG_NAME]],
              },
            ],
          };

          H.editDashboardCard(dashboardCard, mapFilterToCard);
        });
    });

    it("in static embedding and in public dashboard scenarios (metabase#27643-1)", () => {
      cy.log("Test the dashboard");
      H.visitDashboard("@dashboardId");
      H.getDashboardCard().should("contain", "true");
      H.toggleFilterWidgetValues(["false"]);
      H.getDashboardCard().should("contain", "false");

      cy.log("Test the embedded dashboard");
      cy.get("@dashboardId").then((dashboard) => {
        H.visitEmbeddedPage({
          resource: { dashboard },
          params: {},
        });

        H.getDashboardCard().should("contain", "true");
        H.toggleFilterWidgetValues(["false"]);
        H.getDashboardCard().should("contain", "false");
      });

      cy.log("Test the public dashboard");
      cy.get("@dashboardId").then((dashboardId) => {
        // We were signed out due to the previous visitEmbeddedPage
        cy.signInAsAdmin();
        H.visitPublicDashboard(dashboardId);

        H.getDashboardCard().should("contain", "true");
        H.toggleFilterWidgetValues(["false"]);
        H.getDashboardCard().should("contain", "false");
      });
    });
  });

  describe("should allow a native question filter to map to a boolean field filter parameter (metabase#27643)", () => {
    beforeEach(() => {
      cy.get("@postgresInvoicesExpectedInvoiceId").then((fieldId) => {
        H.createNativeQuestion(getQuestionDetails(fieldId), {
          wrapId: true,
          idAlias: "questionId",
        });
      });
    });

    it("in static embedding and in public question scenarios (metabase#27643-2)", () => {
      cy.log("Test the question");
      H.visitQuestion("@questionId");
      cy.findAllByRole("gridcell").should("contain", "true");
      H.toggleFilterWidgetValues(["false"]);
      H.queryBuilderMain().button("Get Answer").click();
      cy.findAllByRole("gridcell").should("contain", "false");

      cy.log("Test the embedded question");
      cy.get("@questionId").then((question) => {
        H.visitEmbeddedPage({
          resource: { question },
          params: {},
        });

        cy.findAllByRole("gridcell").should("contain", "true");
        H.toggleFilterWidgetValues(["false"]);
        cy.findAllByRole("gridcell").should("contain", "false");
      });

      cy.log("Test the public question");
      cy.get("@questionId").then((questionId) => {
        // We were signed out due to the previous visitEmbeddedPage
        cy.signInAsAdmin();
        H.visitPublicQuestion(questionId);

        cy.findAllByRole("gridcell").should("contain", "true");
        H.toggleFilterWidgetValues(["false"]);
        cy.findAllByRole("gridcell").should("contain", "false");
      });
    });
  });
});

describe("dashboard preview", () => {
  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID },
  };

  const filter3 = {
    name: "Text 2",
    slug: "text_2",
    id: "b0665b6a",
    type: "string/=",
    sectionId: "string",
  };

  const filter2 = {
    name: "Text 1",
    slug: "text_1",
    id: "d4c9f2e5",
    type: "string/=",
    sectionId: "string",
  };

  const filter = {
    filteringParameters: [filter2.id],
    name: "Text",
    slug: "text",
    id: "d1b69627",
    type: "string/=",
    sectionId: "string",
  };

  beforeEach(() => {
    cy.intercept("GET", "/api/preview_embed/dashboard/**").as(
      "previewDashboard",
    );
    cy.intercept("GET", "/api/preview_embed/dashboard/**/params/**/values").as(
      "previewValues",
    );

    H.restore();
    cy.signInAsAdmin();
  });

  it("dashboard linked filters values don't work in static embed preview (metabase#37914)", () => {
    const dashboardDetails = {
      parameters: [filter, filter2, filter3],
      enable_embedding: true,
      embedding_params: {
        [filter.slug]: "enabled",
        [filter2.slug]: "enabled",
        [filter3.slug]: "enabled",
      },
    };
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { card_id, dashboard_id } }) => {
      H.addOrUpdateDashboardCard({
        dashboard_id,
        card_id,
        card: {
          parameter_mappings: [
            {
              card_id,
              parameter_id: filter.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter2.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter3.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      });

      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "parameters",
        previewMode: "preview",
      });
    });

    H.modal().within(() => {
      // Makes it less likely to flake.
      cy.wait("@previewDashboard");

      H.getIframeBody().within(() => {
        cy.log(
          "Set filter 2 value, so filter 1 should be filtered by filter 2",
        );
        cy.button(filter2.name).click();
        cy.wait("@previewValues");
        H.popover().within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Widget").should("be.visible");
          cy.findByText("Doohickey").click();
          cy.button("Add filter").click();
        });

        cy.log("Assert filter 1");
        cy.button(filter.name).click();
        H.popover().within(() => {
          cy.findByText("Gadget").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Widget").should("not.exist");
          cy.findByText("Doohickey").should("be.visible");
        });
      });
    });
  });
});

describe("issue 40660", () => {
  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const dashboardDetails = {
    name: "long dashboard",
    enable_embedding: true,
  };

  beforeEach(() => {
    cy.intercept("GET", "/api/preview_embed/dashboard/**").as(
      "previewDashboard",
    );

    H.restore();
    cy.signInAsAdmin();
  });

  it("static dashboard content shouldn't overflow its container (metabase#40660)", () => {
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      H.updateDashboardCards({
        dashboard_id,
        cards: [{ card_id }, { card_id }, { card_id }],
      });

      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "parameters",
        previewMode: "preview",
      });
    });

    H.getIframeBody().within(() => {
      cy.findByText(dashboardDetails.name).should("be.visible");
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findAllByText("1018947080336").should("have.length", 3);
      cy.findByTestId("embed-frame").scrollTo("bottom");

      cy.findByRole("link", { name: "Powered by Metabase" })
        .scrollIntoView()
        .should("be.visible");
    });
  });
});

// Skipped since it does not make sense when CSP is disabled
describe("issue 49142", { tags: "@skip" }, () => {
  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const dashboardDetails = {
    name: "Embeddable dashboard",
    enable_embedding: true,
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("embedding preview should be always working", () => {
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "lookAndFeel",
        previewMode: "preview",
      });
    });

    cy.findByTestId("embed-preview-iframe")
      .its("0.contentDocument.body")
      .should("be.visible")
      .and("contain", "Embeddable dashboard");
  });
});

describe("issue 8490", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    H.createDashboardWithQuestions({
      dashboardDetails: {
        name: "Dashboard to test locale",
        enable_embedding: true,
      },
      questions: [
        {
          name: "Line chart",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              [
                "field",
                PRODUCTS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
            filter: [
              "between",
              ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
              "2027-01-01",
              "2028-01-01",
            ],
          },
          limit: 100,
          visualization_settings: {
            "graph.dimensions": ["CREATED_AT", "CATEGORY"],
            "graph.metrics": ["count"],
          },
          display: "bar",
          enable_embedding: true,
        },
        {
          name: "Order quantity trend",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "sum",
                ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
              ],
            ],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
            filter: [
              "and",
              [
                "between",
                ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
                "2027-10-01",
                "2027-12-01",
              ],
              [
                "=",
                [
                  "field",
                  PRODUCTS.VENDOR,
                  {
                    "base-type": "type/Text",
                    "source-field": ORDERS.PRODUCT_ID,
                  },
                ],
                "Alfreda Konopelski II Group",
              ],
            ],
          },
          display: "smartscalar",
        },
        {
          name: "Pie chart",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PRODUCTS.VENDOR,
                { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
            limit: 5,
          },
          visualization_settings: {
            "pie.slice_threshold": 20,
          },
          display: "pie",
        },
      ],
      cards: [{}, { col: 11 }],
    }).then(({ dashboard, questions: [lineChartQuestion] }) => {
      cy.wrap(dashboard.id).as("dashboardId");
      cy.wrap(lineChartQuestion.id).as("lineChartQuestionId");
    });
  });

  it("static embeddings with `#locale` should show translate the loading message (metabase#50182)", () => {
    cy.intercept(
      {
        method: "GET",
        url: "/api/embed/dashboard/*",
        middleware: true,
      },
      (req) => {
        req.on("response", (res) => {
          const MINUTE = 60 * 1000;
          res.setDelay(MINUTE);
        });
      },
    ).as("dashboardRequest");
    cy.intercept(
      {
        method: "GET",
        url: "/api/embed/card/*",
        middleware: true,
      },
      (req) => {
        req.on("response", (res) => {
          const MINUTE = 60 * 1000;
          res.setDelay(MINUTE);
        });
      },
    ).as("questionRequest");

    cy.log("test a static embedded dashboard");
    cy.get("@dashboardId").then((dashboardId) => {
      H.visitEmbeddedPage(
        {
          resource: { dashboard: dashboardId },
          params: {},
        },
        {
          additionalHashOptions: {
            locale: "ko",
          },
        },
      );
    });

    // Loading...
    cy.findByTestId("embed-frame")
      .findByText("로드 중...")
      .should("be.visible");

    cy.log("test a static embedded question");
    cy.get("@lineChartQuestionId").then((lineChartQuestionId) => {
      H.visitEmbeddedPage(
        {
          resource: { question: lineChartQuestionId },
          params: {},
        },
        {
          additionalHashOptions: {
            locale: "ko",
          },
        },
      );
    });

    // Loading...
    cy.findByTestId("embed-frame").findByText("로딩...").should("be.visible");
  });

  it("static embeddings should respect `#locale` hash parameter (metabase#8490, metabase#50182)", () => {
    cy.log("test a static embedded dashboard");
    const {
      promise: dashboardLoaderPromise,
      resolve: resolveDashboardLoaderPromise,
    } = defer();
    cy.intercept(
      {
        method: "GET",
        url: "/api/embed/dashboard/*",
      },
      () => dashboardLoaderPromise,
    ).as("dashboardRequest");

    cy.get("@dashboardId").then((dashboardId) => {
      H.visitEmbeddedPage(
        {
          resource: { dashboard: dashboardId },
          params: {},
        },
        {
          additionalHashOptions: {
            locale: "ko",
          },
        },
      );
    });

    cy.findByTestId("embed-frame").within(() => {
      cy.log(
        "static embeddings with `#locale` should show a translated the loading message",
      );
      // Loading...
      cy.findByText("로드 중...")
        .should("be.visible")
        .then(resolveDashboardLoaderPromise);

      cy.log("assert the line chart");
      H.getDashboardCard(0).within(() => {
        // X-axis labels: Jan 2024 (or some other year)
        cy.findByText(/^1월 20\d\d\b/).should("be.visible");
        // Aggregation "count"
        cy.findByText("카운트").should("be.visible");
      });
    });

    cy.findByTestId("embed-frame").within(() => {
      cy.log("assert the trend chart");
      H.getDashboardCard(2).within(() => {
        // N/A
        cy.findByText("해당 없음").should("be.visible");
        // (No data)
        cy.findByText("(데이터 없음)").should("be.visible");
      });

      cy.log("assert the pie chart");
      H.getDashboardCard(1).within(() => {
        // Total
        cy.findByText("합계").should("be.visible");
        // Other
        cy.findByTestId("chart-legend").findByText("기타").should("be.visible");
      });
    });

    cy.log("test a static embedded question");
    const {
      promise: questionLoaderPromise,
      resolve: resolveQuestionLoaderPromise,
    } = defer();
    cy.intercept(
      {
        method: "GET",
        url: "/api/embed/card/*",
      },
      () => questionLoaderPromise,
    ).as("questionRequest");

    cy.log("assert the line chart");
    cy.get("@lineChartQuestionId").then((lineChartQuestionId) => {
      H.visitEmbeddedPage(
        {
          resource: { question: lineChartQuestionId },
          params: {},
        },
        {
          additionalHashOptions: {
            locale: "ko",
          },
        },
      );
    });

    cy.findByTestId("embed-frame").within(() => {
      cy.log(
        "static embeddings with `#locale` should show a translated the loading message",
      );
      // Loading...
      cy.findByText("로딩...")
        .should("be.visible")
        .then(resolveQuestionLoaderPromise);

      // X-axis labels: Jan 2023 (or some other year)
      cy.findByText(/11월 20\d\d\b/).should("be.visible");
      // Aggregation "count"
      cy.findByText("카운트").should("be.visible");
    });
  });
});

describe("issue 50373", () => {
  it("should return cache headers in production for js bundle", () => {
    cy.intercept(
      {
        method: "GET",
        url: /^\/app\/dist\/(.*)\.js$/,
      },
      (req) => {
        // When running in development (e.g. with `bun run dev`),
        // the *.hot.bundle.js hot-reloaded file is served by the dev server.
        if (req.url.includes("hot.bundle.js")) {
          return;
        }

        req.on("response", (res) => {
          expect(
            res.headers["cache-control"],
            `Invalid Cache-Control header for ${req.url}`,
          ).to.equal("public, max-age=31536000");
        });
      },
    );

    H.visitEmbeddedPage({ resource: { dashboard: ORDERS_DASHBOARD_ID } });
  });
});

describe("issue 51934 (EMB-189)", () => {
  const COLLECTION_NAME = "Model Collection";
  const MODEL_IN_ROOT_NAME = "Products Model";
  const MODEL_IN_COLLECTION_NAME = "QA Postgres12 Orders Model";
  const QUESTION_IN_COLLECTION_NAME = "Orders Question";

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.createModelFromTableName({
      tableName: "products",
      modelName: MODEL_IN_ROOT_NAME,
    });
    H.createCollection({
      name: COLLECTION_NAME,
      alias: "collectionId",
    });
    H.createModelFromTableName({
      tableName: "orders",
      modelName: MODEL_IN_COLLECTION_NAME,
      idAlias: "modelId",
    });
    moveToCollection({
      collectionIdAlias: "collectionId",
      cardIdAlias: "modelId",
    });
    H.createQuestion(
      {
        name: QUESTION_IN_COLLECTION_NAME,
        query: {
          "source-table": ORDERS_ID,
        },
      },
      {
        wrapId: true,
        idAlias: "questionId",
      },
    );
    moveToCollection({
      collectionIdAlias: "collectionId",
      cardIdAlias: "questionId",
    });
  });

  it("should set the starting join step based on the query source", () => {
    startNewEmbeddingQuestion();
    const QA_DB_NAME = "QA Postgres12";
    const DATA_SOURCE_NAME = "Orders";

    // Before the picker can auto-navigate into the data source's collection it
    // resolves the target path asynchronously: a card-metadata fetch plus one
    // `listCollectionItems` request per collection level (root -> Model
    // Collection). On a throttled CI runner that serial chain routinely outlasts
    // Cypress's default 4 s command timeout, so the picker is still showing the
    // parent (root) collections when a default-timeout query gives up — the
    // dominant "cannot find menuitem '...' (only the root collections are
    // present)" flake. Wait for the loader to clear, then give the item lookup a
    // generous timeout so it waits for the path to finish resolving, and assert
    // it is visible (positive anchor) before clicking.
    const PICKER_ITEM_TIMEOUT = 15000;
    const clickPickerItem = (name) => {
      cy.get('[data-testid="mini-picker-list-loader"]').should("not.exist");
      cy.findByRole("menuitem", { name }, { timeout: PICKER_ITEM_TIMEOUT })
        .should("be.visible")
        .click();
    };

    // The data-source picker and the join picker are both rendered by the same
    // embedding DataSourceSelector, so a generic popover query could not tell
    // them apart. When a click swaps one for the other they can briefly overlap
    // (the outgoing one is still in its close transition while the incoming one
    // is already mounted), which made matching ambiguous and flaky on slow CI
    // runners.
    //
    // Each picker now carries its trigger's label as the dropdown's accessible
    // name (`aria-label`), so we can target each popover deterministically by
    // name regardless of any transition overlap. `.filter(":visible").last()`
    // guards against a same-named popover that is still animating closed.
    const pickerPopover = (name) =>
      cy
        .get(`[data-element-id=mantine-popover][aria-label="${name}"]`)
        .filter(":visible")
        .should("have.length.at.least", 1)
        .last();
    const dataSourcePopover = () => pickerPopover("Pick your starting data");
    const joinPopover = () => pickerPopover("Pick data to join");

    cy.log("select a table as a data source");
    dataSourcePopover().within(() => {
      cy.findByText("Raw Data").click();
    });
    dataSourcePopover().within(() => {
      cy.findByRole("heading", { name: QA_DB_NAME }).click();
    });
    dataSourcePopover().within(() => {
      cy.findByRole("option", { name: DATA_SOURCE_NAME }).click();
    });
    H.getNotebookStep("data").button("Join data").click();

    cy.log(
      'select the "Join" step when the data source is a table will open a table in the same database',
    );
    joinPopover().within(() => {
      cy.findByText(QA_DB_NAME).should("be.visible");
      cy.findByRole("option", { name: "Orders" }).should("be.visible");
    });

    cy.log(
      "changing the data source while not selecting the join step should refresh the data picker on the join step",
    );
    H.getNotebookStep("data").findByText(DATA_SOURCE_NAME).click();

    cy.log('go back to the "Bucket" step');
    dataSourcePopover().within(() => {
      cy.icon("chevronleft").click();
    });
    dataSourcePopover().within(() => {
      cy.icon("chevronleft").click();
    });

    cy.log(
      "select a question as a data source should open the saved question step in the same collection as the data source (metabase#58357)",
    );
    dataSourcePopover().within(() => {
      cy.findByText("Saved Questions").click();
    });
    dataSourcePopover().within(() => clickPickerItem(COLLECTION_NAME));
    dataSourcePopover().within(() =>
      clickPickerItem(QUESTION_IN_COLLECTION_NAME),
    );

    cy.log("the join popover is automatically opened");
    joinPopover().within(() => {
      cy.log("the collection of the data source should be selected");
      cy.findByRole("menuitem", { name: COLLECTION_NAME }).should(
        "have.css",
        "background-color",
        // brand color
        "rgb(80, 158, 226)",
      );
      clickPickerItem(QUESTION_IN_COLLECTION_NAME);
    });

    cy.log(
      "select a model as a data source should open the model step in the same collection as the data source",
    );
    H.getNotebookStep("data").findByText(QUESTION_IN_COLLECTION_NAME).click();

    // Go back to the "Bucket" step
    dataSourcePopover().within(() => {
      cy.findByText("Saved Questions").click();
    });
    // We're now at the "Bucket" step
    dataSourcePopover().within(() => {
      cy.findByText("Models").click();
    });
    dataSourcePopover().within(() => clickPickerItem(MODEL_IN_COLLECTION_NAME));

    cy.log("the join popover is automatically opened");
    joinPopover().within(() => {
      cy.log("the collection of the data source should be selected");
      cy.findByRole("menuitem", { name: COLLECTION_NAME }).should(
        "have.css",
        "background-color",
        // brand color
        "rgb(80, 158, 226)",
      );
      clickPickerItem(MODEL_IN_COLLECTION_NAME);
    });

    cy.log(
      "select a data source after selecting a join step should refresh the data picker on the join step",
    );
    H.getNotebookStep("data").findByText(MODEL_IN_COLLECTION_NAME).click();
    dataSourcePopover().within(() => clickPickerItem("Our analytics"));
    dataSourcePopover().within(() => clickPickerItem(MODEL_IN_ROOT_NAME));

    joinPopover().within(() => {
      cy.log("the collection of the new data source should be selected");
      cy.findByRole("menuitem", { name: "Our analytics" }).should(
        "have.css",
        "background-color",
        // brand color
        "rgb(80, 158, 226)",
      );
      cy.findByRole("menuitem", { name: MODEL_IN_ROOT_NAME }).should(
        "be.visible",
      );
    });
  });

  function startNewEmbeddingQuestion() {
    H.visitFullAppEmbeddingUrl({
      url: "/question/notebook",
      qs: {
        data_picker: "staged",
        entity_types: "table,model,question",
      },
    });
  }

  function moveToCollection({ collectionIdAlias, cardIdAlias }) {
    cy.get(`@${collectionIdAlias}`).then((collectionId) => {
      cy.get(`@${cardIdAlias}`).then((cardId) => {
        cy.request("PUT", `/api/card/${cardId}`, {
          collection_id: collectionId,
        });
      });
    });
  }
});

describe("issue 57028", () => {
  const lockedContainsBodyFilter = {
    name: "locked_contains_body",
    slug: "locked_contains_body",
    id: "e6588080",
    type: "string/contains",
    sectionId: "string",
    isMultiSelect: true,
    values_query_type: "none",
  };

  const emailFilter = {
    name: "Email",
    slug: "email",
    id: "d31e550f",
    type: "string/=",
    sectionId: "string",
    values_query_type: "list",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("static embedded editable filter should load dropdown values when a string/contains locked param has multiple values (metabase#57028)", () => {
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Feedback",
        query: { "source-table": FEEDBACK_ID },
      },
      dashboardDetails: {
        parameters: [lockedContainsBodyFilter, emailFilter],
        enable_embedding: true,
        embedding_params: {
          [lockedContainsBodyFilter.slug]: "locked",
          [emailFilter.slug]: "enabled",
        },
      },
    }).then(({ body: { card_id, dashboard_id } }) => {
      H.addOrUpdateDashboardCard({
        dashboard_id,
        card_id,
        card: {
          parameter_mappings: [
            {
              card_id,
              parameter_id: lockedContainsBodyFilter.id,
              target: ["dimension", ["field", FEEDBACK.BODY, null]],
            },
            {
              card_id,
              parameter_id: emailFilter.id,
              target: ["dimension", ["field", FEEDBACK.EMAIL, null]],
            },
          ],
        },
      });

      cy.intercept(
        "GET",
        `/api/embed/dashboard/*/params/${emailFilter.id}/values`,
      ).as("emailValues");

      H.visitEmbeddedPage({
        resource: { dashboard: dashboard_id },
        params: {
          [lockedContainsBodyFilter.slug]: ["March", "damp", "somewhat"],
        },
      });
    });

    H.filterWidget().contains("Email").click();

    cy.wait("@emailValues").its("response.statusCode").should("eq", 200);

    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list").should("be.visible");
      cy.findAllByRole("checkbox").its("length").should("be.greaterThan", 0);
    });
  });
});
