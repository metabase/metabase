import {
  addSummaryGroupingField,
  restore,
  popover,
  modal,
  openOrdersTable,
  summarize,
  visitQuestion,
  openQuestionActions,
  questionInfoButton,
  rightSidebar,
  appBar,
  queryBuilderHeader,
  openNotebook,
} from "e2e/support/helpers";

import {
  ORDERS_QUESTION_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

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
    modal().button("Save").click();
    cy.wait("@cardCreate");
    modal().button("Not now").click();

    // Add a filter in order to be able to save question again
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    popover().within(() => {
      cy.findByText("Total: Auto binned").click();
      cy.findByDisplayValue("Equal to").click();
    });
    cy.findByRole("listbox").findByText("Greater than").click();

    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("60");
      cy.button("Add filter").click();
    });

    queryBuilderHeader().button("Save").click();

    modal().within(() => {
      cy.findByText("Save question").should("be.visible");
      cy.button("Save").should("be.enabled");

      cy.findByText("Save as new question").click();
      cy.findByLabelText("Name")
        .click()
        .type("{selectall}{backspace}", { delay: 50 })
        .blur();
      cy.findByLabelText("Name: required").should("be.empty");
      cy.findByLabelText("Description").should("be.empty");
      cy.button("Save").should("be.disabled");

      cy.findByText(/^Replace original question,/).click();
      cy.button("Save").should("be.enabled");
    });
  });

  it("view and filter saved question", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    cy.findAllByText("Orders"); // question and table name appears

    // filter to only orders with quantity=100
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("Filter by this column").click());
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
    modal().within(() => {
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

    modal().within(() => {
      cy.findByText("Not now").click();
    });

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
      cy.findByTestId("select-button").click();
    });
    popover().findByText("New collection").click();

    const NEW_COLLECTION = "Foo";
    modal().within(() => {
      cy.findByLabelText("Name").type(NEW_COLLECTION);
      cy.findByText("Create").click();
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByTestId("select-button").should("have.text", NEW_COLLECTION);
      cy.findByText("Duplicate").click();
      cy.wait("@cardCreate");
    });

    modal().within(() => {
      cy.findByText("Not now").click();
    });

    cy.findByTestId("qb-header-left-side").within(() => {
      cy.findByDisplayValue("Orders - Duplicate");
    });

    cy.get("header").findByText(NEW_COLLECTION);
  });

  it("should revert a saved question to a previous version", () => {
    cy.intercept("PUT", "/api/card/**").as("updateQuestion");

    visitQuestion(ORDERS_QUESTION_ID);
    questionInfoButton().click();

    rightSidebar().within(() => {
      cy.findByText("History");

      cy.findByPlaceholderText("Add description")
        .type("This is a question")
        .blur();

      cy.wait("@updateQuestion");

      cy.findByText(/added a description/i);

      cy.findByTestId("question-revert-button").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/reverted to an earlier version/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/This is a question/i).should("not.exist");
  });

  it("should show table name in header with a table info popover on hover", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    cy.findByTestId("question-table-badges").trigger("mouseenter");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("9 columns");
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tax")
      .closest(".TableInteractive-headerCellData")
      .as("headerCell")
      .then($cell => {
        const originalWidth = $cell[0].getBoundingClientRect().width;

        // Retries the assertion a few times to ensure it waits for DOM changes
        // More context: https://github.com/metabase/metabase/pull/21823#discussion_r855302036
        function assertColumnResized(attempt = 0) {
          cy.get("@headerCell").then($newCell => {
            const newWidth = $newCell[0].getBoundingClientRect().width;
            if (newWidth === originalWidth && attempt < 3) {
              cy.wait(100);
              assertColumnResized(++attempt);
            } else {
              expect(newWidth).to.be.gt(originalWidth);
            }
          });
        }

        cy.wrap($cell)
          .find(".react-draggable")
          .trigger("mousedown", 0, 0, { force: true })
          .trigger("mousemove", 100, 0, { force: true })
          .trigger("mouseup", 100, 0, { force: true });

        assertColumnResized();
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
});
