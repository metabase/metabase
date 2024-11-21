import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  WEBHOOK_TEST_DASHBOARD,
  WEBHOOK_TEST_HOST,
  WEBHOOK_TEST_SESSION_ID,
  WEBHOOK_TEST_URL,
  addSummaryGroupingField,
  appBar,
  collectionOnTheGoModal,
  entityPickerModal,
  entityPickerModalTab,
  getAlertChannel,
  modal,
  openNotebook,
  openOrdersTable,
  openQuestionActions,
  popover,
  queryBuilderHeader,
  questionInfoButton,
  restore,
  rightSidebar,
  selectFilterOperator,
  sidesheet,
  summarize,
  tableHeaderClick,
  toggleAlertChannel,
  visitQuestion,
} from "e2e/support/helpers";

describe("scenarios > question > saved", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "api/card").as("cardCreate");
  });

  it("should should correctly display 'Save' modal (metabase#13817)", () => {
    openOrdersTable();
    openNotebook();

    summarize({ mode: "notebook" });
    popover().findByText("Count of rows").click();
    addSummaryGroupingField({ field: "Total" });

    // Save the question
    queryBuilderHeader().button("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@cardCreate");
    cy.button("Not now").click();

    // Add a filter in order to be able to save question again
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    popover().findByText("Total: Auto binned").click();
    selectFilterOperator("Greater than");

    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("60");
      cy.button("Add filter").click();
    });

    queryBuilderHeader().button("Save").click();

    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save question").should("be.visible");
      cy.findByTestId("save-question-button").should("be.enabled");

      cy.findByText("Save as new question").click();
      cy.findByLabelText("Name")
        .click()
        .type("{selectall}{backspace}", { delay: 50 })
        .blur();
      cy.findByLabelText("Name: required").should("be.empty");
      cy.findByLabelText("Description").should("be.empty");
      cy.findByTestId("save-question-button").should("be.disabled");

      cy.findByText(/^Replace original question,/).click();
      cy.findByTestId("save-question-button").should("be.enabled");
    });
  });

  it("view and filter saved question", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    cy.findAllByText("Orders"); // question and table name appears

    // filter to only orders with quantity=100
    tableHeaderClick("Quantity");
    popover().findByText("Filter by this column").click();
    selectFilterOperator("Equal to");
    popover().within(() => {
      cy.findByPlaceholderText("Search the list").type("100");
      cy.findByText("100").click();
      cy.findByText("Add filter").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is equal to 100");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 2 rows"); // query updated

    // check that save will give option to replace
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText('Replace original question, "Orders"');
      cy.findByText("Save as new question");
      cy.findByText("Cancel").click();
    });

    // click "Started from Orders" and check that the original question is restored
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Started from").within(() => cy.findByText("Orders").click());
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing first 2,000 rows"); // query updated
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Started from").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is equal to 100").should("not.exist");
  });

  it("should duplicate a saved question", () => {
    cy.intercept("POST", "/api/card").as("cardCreate");

    visitQuestion(ORDERS_QUESTION_ID);

    openQuestionActions();
    popover().within(() => {
      cy.findByText("Duplicate").click();
    });

    modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByText("Duplicate").click();
      cy.wait("@cardCreate");
    });

    cy.button("Not now").click();

    cy.findByTestId("qb-header-left-side").within(() => {
      cy.findByDisplayValue("Orders - Duplicate");
    });
  });

  it("should duplicate a saved question to a collection created on the go", () => {
    cy.intercept("POST", "/api/card").as("cardCreate");

    visitQuestion(ORDERS_QUESTION_ID);

    openQuestionActions();
    popover().within(() => {
      cy.findByText("Duplicate").click();
    });

    modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByTestId("collection-picker-button").click();
    });

    entityPickerModal().findByText("Create a new collection").click();

    const NEW_COLLECTION = "Foo";
    collectionOnTheGoModal().then(() => {
      cy.findByPlaceholderText("My new collection").type(NEW_COLLECTION);
      cy.findByText("Create").click();
    });

    entityPickerModal().findByText("Select").click();

    modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByTestId("collection-picker-button").should(
        "have.text",
        NEW_COLLECTION,
      );
      cy.findByText("Duplicate").click();
      cy.wait("@cardCreate");
    });

    cy.button("Not now").click();

    cy.findByTestId("qb-header-left-side").within(() => {
      cy.findByDisplayValue("Orders - Duplicate");
    });

    cy.get("header").findByText(NEW_COLLECTION);
  });

  it("should revert a saved question to a previous version", () => {
    cy.intercept("PUT", "/api/card/**").as("updateQuestion");

    visitQuestion(ORDERS_QUESTION_ID);
    questionInfoButton().click();

    sidesheet().within(() => {
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
    visitQuestion(ORDERS_QUESTION_ID);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    appBar().within(() => cy.findByText("Our analytics").click());

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });

  it("should show collection breadcrumbs for a saved question in a non-root collection", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
      collection_id: SECOND_COLLECTION_ID,
    });

    visitQuestion(ORDERS_QUESTION_ID);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    appBar().within(() => cy.findByText("Second collection").click());

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });

  it("should show the question lineage when a saved question is changed", () => {
    visitQuestion(ORDERS_QUESTION_ID);

    summarize();
    rightSidebar().within(() => {
      cy.findByText("Quantity").click();
      cy.button("Done").click();
    });

    appBar().within(() => {
      cy.findByText("Started from").should("be.visible");
      cy.findByText("Orders").click();
      cy.findByText("Started from").should("not.exist");
    });
  });

  it("'read-only' user should be able to resize column width (metabase#9772)", () => {
    cy.signIn("readonly");
    visitQuestion(ORDERS_QUESTION_ID);

    cy.findAllByTestId("header-cell")
      .filter(":contains(Tax)")
      .as("headerCell")
      .then($cell => {
        const originalWidth = $cell[0].getBoundingClientRect().width;
        cy.wrap(originalWidth).as("originalWidth");
      });

    cy.get("@headerCell")
      .find(".react-draggable")
      .trigger("mousedown", { which: 1 })
      .trigger("mousemove", { clientX: 100, clientY: 0 })
      .trigger("mouseup", { force: true });

    cy.get("@originalWidth").then(originalWidth => {
      cy.get("@headerCell").should($newCell => {
        const newWidth = $newCell[0].getBoundingClientRect().width;
        expect(newWidth).to.be.gt(originalWidth);
      });
    });
  });

  it("should always be possible to view the full title text of the saved question", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    const savedQuestionTitle = cy.findByTestId("saved-question-header-title");
    savedQuestionTitle.clear();
    savedQuestionTitle.type(
      "Space, the final frontier. These are the voyages of the Starship Enterprise.",
    );
    savedQuestionTitle.blur();

    savedQuestionTitle.should("be.visible").should($el => {
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

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
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
});

//http://127.0.0.1:9080/api/session/00000000-0000-0000-0000-000000000000/requests

// Ensure the webhook tester docker container is running
// docker run -p 9080:8080/tcp tarampampam/webhook-tester serve --create-session 00000000-0000-0000-0000-000000000000
describe(
  "scenarios > question > saved > alerts",
  { tags: ["@external"] },

  () => {
    const firstWebhookName = "E2E Test Webhook";
    const secondWebhookName = "Toucan Hook";

    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      cy.request("POST", "/api/channel", {
        name: firstWebhookName,
        description: "All aboard the Metaboat",
        type: "channel/http",
        details: {
          url: WEBHOOK_TEST_URL,
          "auth-method": "none",
          "fe-form-type": "none",
        },
      });

      cy.request("POST", "/api/channel", {
        name: secondWebhookName,
        description: "Quack!",
        type: "channel/http",
        details: {
          url: WEBHOOK_TEST_URL,
          "auth-method": "none",
          "fe-form-type": "none",
        },
      });
    });

    it("should allow you to enable a webhook alert", () => {
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      cy.findByTestId("sharing-menu-button").click();
      popover().findByText("Create alert").click();
      modal().button("Set up an alert").click();
      modal().within(() => {
        toggleAlertChannel("Email");
        toggleAlertChannel(secondWebhookName);
        cy.button("Done").click();
      });
      cy.findByTestId("sharing-menu-button").click();
      popover().findByText("Edit alerts").click();
      popover().within(() => {
        cy.findByText("You set up an alert").should("exist");
        cy.findByText("Edit").click();
      });

      modal().within(() => {
        getAlertChannel(secondWebhookName).scrollIntoView();
        getAlertChannel(secondWebhookName)
          .findByRole("checkbox")
          .should("be.checked");
      });
    });

    it("should allow you to test a webhook", () => {
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      cy.findByTestId("sharing-menu-button").click();
      popover().findByText("Create alert").click();
      modal().button("Set up an alert").click();
      modal().within(() => {
        getAlertChannel(firstWebhookName).scrollIntoView();

        getAlertChannel(firstWebhookName)
          .findByRole("checkbox")
          .click({ force: true });

        getAlertChannel(firstWebhookName).button("Send a test").click();
      });

      cy.visit(WEBHOOK_TEST_DASHBOARD);

      cy.findByRole("heading", { name: /Requests 1/ }).should("exist");

      cy.request(
        `${WEBHOOK_TEST_HOST}/api/session/${WEBHOOK_TEST_SESSION_ID}/requests`,
      ).then(({ body }) => {
        const payload = cy.wrap(atob(body[0].content_base64));

        payload
          .should("have.string", "alert_creator_name")
          .and("have.string", "Bobby Tables");
      });
    });
  },
);
