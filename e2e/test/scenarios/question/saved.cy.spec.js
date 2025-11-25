const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > saved", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "api/card").as("cardCreate");
  });

  it("view and filter saved question", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    cy.findAllByText("Orders"); // question and table name appears

    // filter to only orders with quantity=100
    H.tableHeaderClick("Quantity");
    H.popover().findByText("Filter by this column").click();
    H.selectFilterOperator("Equal to");
    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list").type("100");
      cy.findByText("100").click();
      cy.findByText("Add filter").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is equal to 100");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 2 rows"); // query updated

    // check that save will give option to replace
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within((modal) => {
      cy.findByText('Replace original question, "Orders"');
      cy.findByText("Save as new question");
      cy.findByText("Cancel").click();
    });

    // click "Started from Orders" and check that the original question is restored
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Started from").within(() => cy.findByText("Orders").click());
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing first 2,000 rows"); // query updated
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Started from").should("not.exist");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is equal to 100").should("not.exist");
  });

  it("should duplicate a saved question into a collection", () => {
    cy.intercept("POST", "/api/card").as("cardCreate");

    H.visitQuestion(ORDERS_QUESTION_ID);

    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Duplicate").click();
    });

    H.modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByText("Duplicate").click();
      cy.wait("@cardCreate");
    });

    cy.findByTestId("qb-header-left-side").within(() => {
      cy.findByDisplayValue("Orders - Duplicate");
    });
  });

  it("should duplicate a saved question into a dashboard", () => {
    cy.intercept("POST", "/api/card").as("cardCreate");

    H.visitQuestion(ORDERS_QUESTION_ID);

    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Duplicate").click();
    });

    H.modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByLabelText(/Where do you want to save this/).click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText("Select a collection or dashboard").should("exist");
      cy.findByText("Orders in a dashboard").click();
      cy.findByRole("button", { name: "Select this dashboard" }).click();
    });
    H.entityPickerModal().should("not.exist");

    H.modal().within(() => {
      cy.findByText("Duplicate").click();
      cy.wait("@cardCreate");
    });

    cy.url().should("include", "/dashboard/");
    cy.location("hash").should("match", /scrollTo=\d+/); // url should have hash param to auto-scroll
    H.dashboardCards().findByText("Orders - Duplicate").should("exist");
  });

  it("should duplicate a saved question to a collection created on the go", () => {
    cy.intercept("POST", "/api/card").as("cardCreate");

    H.visitQuestion(ORDERS_QUESTION_ID);

    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Duplicate").click();
    });

    H.modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByTestId("dashboard-and-collection-picker-button").click();
    });

    H.entityPickerModal().findByText("New collection").click();

    const NEW_COLLECTION = "My New collection";
    H.collectionOnTheGoModal().then(() => {
      cy.findByPlaceholderText("My new collection").type(NEW_COLLECTION);
      cy.findByText("Create").click();
    });

    H.entityPickerModal()
      .button(/Select/)
      .click();

    H.modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByTestId("dashboard-and-collection-picker-button").should(
        "have.text",
        NEW_COLLECTION,
      );
      cy.button("Duplicate").click();
      cy.wait("@cardCreate");
    });

    cy.findByTestId("qb-header-left-side").within(() => {
      cy.findByDisplayValue("Orders - Duplicate");
    });

    cy.get("header").findByText(NEW_COLLECTION);
  });

  it("should duplicate a saved question to a dashboard created on the go", () => {
    cy.intercept("POST", "/api/card").as("cardCreate");

    H.visitQuestion(ORDERS_QUESTION_ID);

    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Duplicate").click();
    });

    H.modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByTestId("dashboard-and-collection-picker-button").click();
    });

    H.entityPickerModal().findByText("New dashboard").click();

    const NEW_DASHBOARD = "Foo Dashboard";
    H.dashboardOnTheGoModal().within(() => {
      cy.findByLabelText(/Give it a name/).type(NEW_DASHBOARD);
      cy.findByText("Create").click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText(NEW_DASHBOARD).click();
      cy.button(/Select/).click();
    });
    H.entityPickerModal().should("not.exist");

    H.modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByTestId("dashboard-and-collection-picker-button").should(
        "have.text",
        NEW_DASHBOARD,
      );
      cy.button("Duplicate").click();
      cy.wait("@cardCreate");
    });

    cy.findByTestId("qb-header-left-side").within(() => {
      cy.findByDisplayValue("Orders - Duplicate");
    });

    cy.get("header").findByText(NEW_DASHBOARD);
    cy.url().should("include", "/dashboard/");
  });

  it("should not add scrollbar to duplicate modal if question name is long (metabase#53364)", () => {
    H.createQuestion(
      {
        name: "A".repeat(240),
        query: {
          "source-table": ORDERS_ID,
        },
      },
      { visitQuestion: true },
    );
    H.openQuestionActions();
    H.popover().findByText("Duplicate").click();

    H.modal().should(($el) => {
      const $modal = $el[0];
      expect($modal.clientWidth).to.be.equal($modal.scrollWidth);
    });
  });

  it("should revert a saved question to a previous version", () => {
    cy.intercept("PUT", "/api/card/**").as("updateQuestion");

    H.visitQuestion(ORDERS_QUESTION_ID);
    H.questionInfoButton().click();

    H.sidesheet().within(() => {
      cy.findByPlaceholderText("Add description")
        .type("This is a question")
        .blur();

      cy.wait("@updateQuestion");

      cy.findByRole("tab", { name: "History" }).click();
      cy.findByText(/added a description/i);

      cy.findByTestId("question-revert-button").click();

      cy.findByRole("tab", { name: "History" }).click();
      cy.findByText(/reverted to an earlier version/i);
      cy.findByText(/This is a question/i).should("not.exist");
    });
  });

  it("should show collection breadcrumbs for a saved question in the root collection", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    H.appBar().within(() => cy.findByText("Our analytics").click());

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });

  it("should show collection breadcrumbs for a saved question in a non-root collection", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      collection_id: SECOND_COLLECTION_ID,
    });

    H.visitQuestion(ORDERS_QUESTION_ID);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    H.appBar().within(() => cy.findByText("Second collection").click());

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });

  it("should show dashboard breadcrumbs for a saved question in a dashboard", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      dashboard_id: ORDERS_DASHBOARD_ID,
    });

    H.visitQuestion(ORDERS_QUESTION_ID);
    H.appBar().within(() => {
      cy.findByText("Our analytics").should("exist");
      cy.log("should be able to navigate to the parent dashboard");
      cy.findByText("Orders in a dashboard").should("exist").click();
    });

    cy.log(
      "should have dashboard info disappear when navigating away from question",
    );
    H.appBar().within(() => {
      cy.findByText("Our analytics").should("exist");
      cy.findByText("Orders in a dashboard").should("not.exist");
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });

  it("should show the question lineage when a saved question is changed", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);

    H.summarize();
    H.rightSidebar().within(() => {
      cy.findByText("Quantity").click();
      cy.button("Done").click();
    });

    H.appBar().within(() => {
      cy.findByText("Started from").should("be.visible");
      cy.findByText("Orders").click();
      cy.findByText("Started from").should("not.exist");
    });
  });

  it("'read-only' user should be able to resize column width (metabase#9772)", () => {
    cy.signIn("readonly");
    H.visitQuestion(ORDERS_QUESTION_ID);

    cy.findAllByTestId("header-cell")
      .filter(":contains(Tax)")
      .as("headerCell")
      .then(($cell) => {
        const originalWidth = $cell[0].getBoundingClientRect().width;
        cy.wrap(originalWidth).as("originalWidth");
      });

    cy.findByTestId("resize-handle-TAX").trigger("mousedown", {
      button: 0,
      clientX: 0,
      clientY: 0,
    });

    // HACK: TanStack table resize handler does not resize column if we fire only one mousemove event
    const stepX = 10;
    cy.get("body")
      .trigger("mousemove", {
        clientX: stepX,
        clientY: 0,
      })
      .trigger("mousemove", {
        clientX: stepX * 2,
        clientY: 0,
      });
    cy.get("body").trigger("mouseup", { force: true });

    // Wait until column width gets updated
    cy.wait(10);

    cy.get("@originalWidth").then((originalWidth) => {
      cy.get("@headerCell").should(($newCell) => {
        const newWidth = $newCell[0].getBoundingClientRect().width;
        expect(newWidth).to.be.gte(originalWidth + stepX * 2);
      });
    });
  });

  it("should always be possible to view the full title text of the saved question", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    cy.findByTestId("saved-question-header-title")
      .as("savedQuestionTitle")
      .should("be.visible")
      .clear()
      .type(
        "Space, the final frontier. These are the voyages of the Starship Enterprise.",
      )
      .blur();

    cy.get("@savedQuestionTitle")
      .should("be.visible")
      .should(($el) => {
        // clientHeight: height of the textarea
        // scrollHeight: height of the text content, including content not visible on the screen
        const heightDifference = $el[0].clientHeight - $el[0].scrollHeight;
        expect(heightDifference).to.eq(0);
      });
  });

  it("should not show '- Modified' suffix after we click 'Save' on a new model (metabase#42773)", () => {
    cy.log("Use UI to create a model based on the Products table");
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();

    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Products").click();
    });

    cy.findByTestId("dataset-edit-bar").button("Save").click();

    cy.findByTestId("save-question-modal").within(() => {
      cy.button("Save").click();
      cy.wait("@cardCreate");
      // It is important to have extremely short timeout in order to catch the issue
      cy.findByDisplayValue("Products - Modified", { timeout: 10 }).should(
        "not.exist",
      );
    });
  });

  describe("with hidden tables", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    const HIDDEN_TYPES = ["hidden", "technical", "cruft"];

    function hideTable({ name, id, visibilityType }) {
      // Since v56 it's no longer possible to specify the reason (e.g. "technical" or "cruft")
      // for hiding the table via UI.
      // We still want to support cases where visibility type has been set to such values in
      // the past, so we simulate it with API call.
      if (visibilityType === "technical" || visibilityType === "cruft") {
        cy.request("PUT", `/api/table/${id}`, {
          visibility_type: visibilityType,
        });
      } else {
        H.DataModel.visit();
        H.DataModel.TablePicker.getTable(name).click();
        H.DataModel.TablePicker.getTable(name).button("Hide table").click();
      }
    }

    HIDDEN_TYPES.forEach((visibilityType) => {
      it(`should show a View-only tag when the source table is marked as ${visibilityType}`, () => {
        hideTable({ name: "Orders", id: ORDERS_ID, visibilityType });

        H.visitQuestion(ORDERS_QUESTION_ID);

        H.queryBuilderHeader()
          .findByText("View-only")
          .should("be.visible")
          .realHover();
        H.popover()
          .findByText(
            "One of the administrators hid the source table “Orders”, making this question view-only.",
          )
          .should("be.visible");
      });

      it(`should show a View-only tag when a joined table is marked as ${visibilityType}`, () => {
        cy.signInAsAdmin();
        hideTable({ name: "Products", id: PRODUCTS_ID, visibilityType });
        H.createQuestion(
          {
            name: "Joined question",
            query: {
              "source-table": ORDERS_ID,
              joins: [
                {
                  "source-table": PRODUCTS_ID,
                  alias: "Orders",
                  condition: [
                    "=",
                    ["field", ORDERS.PRODUCT_ID, null],
                    ["field", PRODUCTS.ID, { "join-alias": "Products" }],
                  ],
                  fields: "all",
                },
              ],
            },
          },
          {
            visitQuestion: true,
          },
        );
        H.queryBuilderHeader()
          .findByText("View-only")
          .should("be.visible")
          .realHover();
        H.popover()
          .findByText(
            "One of the administrators hid the source table “Products”, making this question view-only.",
          )
          .should("be.visible");
      });
    });

    function moveQuestionTo(newCollectionName) {
      H.openQuestionActions();
      cy.findByTestId("move-button").click();
      H.entityPickerModal().within(() => {
        cy.findByText(newCollectionName).click();
        cy.button("Move").click();
      });
    }

    it("should show a View-only tag when one of the source cards is unavailable", () => {
      H.createQuestion(
        {
          name: "Products Question + Orders",
          query: {
            "source-table": `card__${ORDERS_QUESTION_ID}`,
            joins: [
              {
                "source-table": PRODUCTS_ID,
                alias: "Orders Question",
                fields: "all",
                condition: [
                  "=",
                  ["field", PRODUCTS.PRODUCT_ID, null],
                  ["field", ORDERS.ID, { "join-alias": "Orders" }],
                ],
              },
            ],
          },
        },
        {
          wrapId: true,
          idAlias: "questionId",
        },
      );

      H.visitQuestion(ORDERS_QUESTION_ID);
      moveQuestionTo(/Personal Collection/);

      cy.signInAsNormalUser();
      cy.get("@questionId").then(H.visitQuestion);

      H.queryBuilderHeader().findByText("View-only").should("be.visible");
    });
  });

  describe("with watermark", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      cy.intercept("/api/session/properties", (req) => {
        req.continue((res) => {
          res.body["token-features"].development_mode = true;
        });
      });

      cy.request("PUT", `/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
        collection_position: 1,
        enable_embedding: true,
      });

      cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
        enable_embedding: true,
      });
    });

    it("should show questions with a watermark when in dev mode whereever we show visualizations", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      cy.findByTestId("development-watermark").should("exist");

      H.appBar()
        .findByRole("link", { name: /Our analytics/i })
        .click();
      cy.findByTestId("pinned-items")
        .findAllByTestId("development-watermark")
        .should("have.length.above", 0);

      cy.findByTestId("collection-table")
        .findByRole("link", { name: /Orders in a dashboard/i })
        .click();
      cy.findAllByTestId("development-watermark").should(
        "have.length.above",
        0,
      );

      H.visitEmbeddedPage({
        resource: { dashboard: ORDERS_DASHBOARD_ID },
        params: {},
      });

      cy.findAllByTestId("development-watermark").should(
        "have.length.greaterThan",
        0,
      );

      H.visitEmbeddedPage({
        resource: { question: ORDERS_BY_YEAR_QUESTION_ID },
        params: {},
      });

      cy.findAllByTestId("development-watermark").should(
        "have.length.greaterThan",
        0,
      );

      //Need to sign in to generate the public link for the orders question
      cy.signInAsAdmin();

      H.visitPublicQuestion(ORDERS_QUESTION_ID);
      cy.findAllByTestId("development-watermark").should(
        "have.length.above",
        0,
      );

      //Need to sign in to generate the public link for the orders dashboard
      cy.signInAsAdmin();

      H.visitPublicDashboard(ORDERS_DASHBOARD_ID);
      cy.findAllByTestId("development-watermark").should(
        "have.length.above",
        0,
      );
    });
  });
});

//http://127.0.0.1:9080/api/session/00000000-0000-0000-0000-000000000000/requests

// Ensure the webhook tester docker container is running
// docker run -p 9080:8080/tcp tarampampam/webhook-tester:1.1.0 serve --create-session 00000000-0000-0000-0000-000000000000
describe(
  "scenarios > question > saved > alerts",
  { tags: ["@external"] },

  () => {
    const firstWebhookName = "E2E Test Webhook";
    const secondWebhookName = "Toucan Hook";

    beforeEach(() => {
      H.resetWebhookTester();
      H.restore();
      cy.signInAsAdmin();
      H.setupSMTP();

      cy.request("POST", "/api/channel", {
        name: firstWebhookName,
        description: "All aboard the Metaboat",
        type: "channel/http",
        details: {
          url: H.WEBHOOK_TEST_URL,
          "auth-method": "none",
          "fe-form-type": "none",
        },
      });

      cy.request("POST", "/api/channel", {
        name: secondWebhookName,
        description: "Quack!",
        type: "channel/http",
        details: {
          url: H.WEBHOOK_TEST_URL,
          "auth-method": "none",
          "fe-form-type": "none",
        },
      });
    });

    it("should allow you to enable a webhook alert", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Create an alert").click();

      H.modal().findByText("New alert").should("be.visible");
      H.removeNotificationHandlerChannel("Email");
      H.addNotificationHandlerChannel(secondWebhookName, {
        hasNoChannelsAdded: true,
      });
      H.modal().button("Done").click();

      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Edit alerts").click();
      H.modal()
        .findByText(/Created by you/)
        .should("be.exist")
        .click();

      H.modal().findByText(secondWebhookName).should("be.visible");
    });

    // There is no api to test individual hooks for new Question Alerts
    it("should allow you to test a webhook", { tags: "@skip" }, () => {
      cy.intercept("POST", "/api/pulse/test").as("testAlert");
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Create an alert").click();

      H.modal().within(() => {
        H.getAlertChannel(firstWebhookName).scrollIntoView();

        H.getAlertChannel(firstWebhookName)
          .findByRole("checkbox")
          .click({ force: true });

        H.getAlertChannel(firstWebhookName).button("Send a test").click();
      });

      cy.wait("@testAlert");

      cy.request(
        `${H.WEBHOOK_TEST_HOST}/api/session/${H.WEBHOOK_TEST_SESSION_ID}/requests`,
      ).then(({ body }) => {
        expect(body).to.have.length(1);

        cy.wrap(atob(body[0].content_base64))
          .should("have.string", "alert_creator_name")
          .and("have.string", "Bobby Tables");
      });
    });
  },
);
