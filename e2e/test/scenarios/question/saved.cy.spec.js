import {
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
  getCollectionIdFromSlug,
} from "e2e/support/helpers";

describe("scenarios > question > saved", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should should correctly display 'Save' modal (metabase#13817)", () => {
    openOrdersTable();
    cy.icon("notebook").click();
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().findByText("Total").click();
    // Save the question
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().within(() => {
      cy.findByText("Save").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").should("not.exist");

    // Add a filter in order to be able to save question again
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();
    popover()
      .findByText(/^Total$/)
      .click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Equal to").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Greater than").click();
    cy.findByPlaceholderText("Enter a number").type("60");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filter").click();

    // Save question - opens "Save question" modal
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    modal().within(() => {
      cy.findByText("Save question");
      cy.button("Save").as("saveButton");
      cy.get("@saveButton").should("not.be.disabled");

      cy.log(
        "**When there is no question name, it shouldn't be possible to save**",
      );
      cy.findByText("Save as new question").click();
      cy.findByLabelText("Name")
        .click()
        .type("{selectall}{backspace}", { delay: 50 })
        .blur();
      cy.findByLabelText("Name: required").should("be.empty");
      cy.findByLabelText("Description").should("be.empty");
      cy.get("@saveButton").should("be.disabled");

      cy.log(
        "**It should `always` be possible to overwrite the original question**",
      );
      cy.findByText(/^Replace original question,/).click();
      cy.get("@saveButton").should("not.be.disabled");
    });
  });

  it("view and filter saved question", () => {
    visitQuestion(1);
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

    visitQuestion(1);

    openQuestionActions();
    popover().within(() => {
      cy.icon("segment").click();
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

  it("should revert a saved question to a previous version", () => {
    cy.intercept("PUT", "/api/card/**").as("updateQuestion");

    visitQuestion(1);
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
    cy.findByText(/reverted to an earlier revision/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/This is a question/i).should("not.exist");
  });

  it("should show table name in header with a table info popover on hover", () => {
    visitQuestion(1);
    cy.findByTestId("question-table-badges").trigger("mouseenter");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("9 columns");
  });

  it("should show collection breadcrumbs for a saved question in the root collection", () => {
    visitQuestion(1);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    appBar().within(() => cy.findByText("Our analytics").click());

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });

  it("should show collection breadcrumbs for a saved question in a non-root collection", () => {
    getCollectionIdFromSlug("second_collection", collection_id => {
      cy.request("PUT", "/api/card/1", { collection_id });
    });

    visitQuestion(1);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    appBar().within(() => cy.findByText("Second collection").click());

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });

  it("should show the question lineage when a saved question is changed", () => {
    visitQuestion(1);

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
    visitQuestion(1);

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
});
