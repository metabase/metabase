const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
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

    // capture the view header height in the saved state to assert it does not
    // change after the question transitions to ad-hoc (UXW-3751)
    let savedHeaderHeight: number | undefined;
    cy.findByTestId("qb-header")
      .invoke("outerHeight")
      .then((h) => {
        savedHeaderHeight = h;
      });

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

    // view header height should be unchanged in the ad-hoc state
    cy.findByTestId("qb-header")
      .invoke("outerHeight")
      .should((h) => {
        expect(h).to.equal(savedHeaderHeight);
      });

    // check that save will give option to replace
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
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

  it("should duplicate a saved question into a collection, into a dashboard, and to a collection created on the go", () => {
    cy.log("into a collection");
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

    cy.log("into a dashboard");
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
    cy.location("hash").should("not.include", "scrollTo");
    H.dashboardCards().findByText("Orders - Duplicate").should("be.visible");

    cy.log("to a collection created on the go");
    H.visitQuestion(ORDERS_QUESTION_ID);

    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Duplicate").click();
    });

    H.modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByTestId("dashboard-and-collection-picker-button").click();
    });

    H.entityPickerModal().button("New collection").should("be.enabled").click();

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

    H.modal()
      .findByLabelText("Name")
      .should(($input) => {
        expect($input.val()).to.match(/ - Duplicate$/);
      });
    H.modal().should(($el) => {
      const $modal = $el[0];
      expect($modal.clientWidth).to.be.equal($modal.scrollWidth);
    });
  });

  it("should revert a saved question to a previous version", () => {
    cy.intercept("PUT", "/api/card/**").as("updateQuestion");
    cy.intercept("POST", "/api/revision/revert").as("revertRevision");

    H.visitQuestion(ORDERS_QUESTION_ID);
    H.questionInfoButton().click();

    H.sidesheet().within(() => {
      cy.findByPlaceholderText("Add description")
        .type("This is a question")
        .blur();

      cy.wait("@updateQuestion");
      cy.findByText("This is a question").should("be.visible");
      cy.findByText(/added a description/i);

      cy.findByTestId("question-revert-button").click();
      cy.wait("@revertRevision");
      cy.findByText(/reverted to an earlier version/i);
      cy.findByPlaceholderText("Add description").should("have.value", "");
    });
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

    cy.location("pathname").should(
      "match",
      new RegExp(`^/dashboard/${ORDERS_DASHBOARD_ID}(-|$)`),
    );
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").should("be.visible");
  });

  it("'read-only' user should be able to resize column width (metabase#9772)", () => {
    cy.signIn("readonly");
    H.visitQuestion(ORDERS_QUESTION_ID);

    cy.findAllByTestId("header-cell")
      .filter(":contains(Tax)")
      .as("headerCell")
      .should("be.visible")
      .then(($cell) => {
        cy.wrap($cell[0].getBoundingClientRect().width).as("originalWidth");
      });

    const moveX = 100;

    // The TanStack resize handle re-renders while the grid measures itself, so a
    // single drag is occasionally lost or only partially applied and the column
    // never grows enough. Re-run the (idempotent, gte-checked) drag until the
    // column has actually widened, turning a dropped drag into a non-event.
    cy.get<number>("@originalWidth").then((originalWidth) => {
      const minWidth = originalWidth + moveX * 0.6;

      const dragUntilResized = (attemptsLeft: number) => {
        cy.findByTestId("resize-handle-TAX").trigger("mousedown", {
          button: 0,
          clientX: 0,
          clientY: 0,
        });
        cy.get("body")
          .trigger("mousemove", { clientX: moveX / 2, clientY: 0 })
          .trigger("mousemove", { clientX: moveX, clientY: 0 })
          .trigger("mouseup", { button: 0, clientX: moveX, clientY: 0 });

        cy.get("@headerCell").then(($cell) => {
          const width = $cell[0].getBoundingClientRect().width;
          if (width < minWidth && attemptsLeft > 0) {
            dragUntilResized(attemptsLeft - 1);
          }
        });
      };

      dragUntilResized(4);

      cy.get("@headerCell").should(($cell) => {
        expect($cell[0].getBoundingClientRect().width).to.be.gte(minWidth);
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

  describe("with hidden tables", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    // The `technical` and `cruft` visibility types, which only the API can
    // set since v56, are covered in ViewOnly.unit.spec.tsx.
    function hideTable(name: string) {
      H.DataModel.visit();
      H.DataModel.TablePicker.getTable(name).click();
      H.DataModel.TablePicker.getTable(name).button("Hide table").click();
    }

    it("should show a View-only tag when a joined or the source table is hidden", () => {
      hideTable("Products");
      H.createQuestion(
        {
          name: "Joined question",
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                "source-table": PRODUCTS_ID,
                alias: "Products",
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

      hideTable("Orders");

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
  });
});

//http://127.0.0.1:9080/api/session/00000000-0000-0000-0000-000000000000/requests

// Ensure the webhook tester docker container is running
// docker run -p 127.0.0.1:9080:8080/tcp tarampampam/webhook-tester:1.1.0 serve --create-session 00000000-0000-0000-0000-000000000000
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
      H.selectScheduleTime();
      H.modal().button("Done").click();

      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Edit alerts").click();
      H.modal()
        .findByText(/Created by you/)
        .should("be.exist")
        .click();

      H.modal().findByText(secondWebhookName).should("be.visible");
    });
  },
);
