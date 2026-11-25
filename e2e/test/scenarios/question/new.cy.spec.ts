const { H } = cy;
import { SAMPLE_DB_ID, USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { THIRD_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// test various entry points into the query builder

describe("scenarios > question > new", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("data picker", () => {
    it("should be possible to create a question based on a question in another user personal collection", () => {
      cy.signOut();
      cy.signIn("nocollection");
      H.startNewQuestion();
      H.miniPickerBrowseAll().click();
      H.pickEntity({ path: ["Databases", "Sample Database", "Orders"] });
      H.visualize();
      H.saveQuestion("Personal question");

      cy.signOut();
      cy.signInAsAdmin();
      H.startNewQuestion();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Our analytics").click();
        cy.findByText("All personal collections").click();
        cy.findByText(H.getPersonalCollectionName(USERS.nocollection)).click();
        cy.findByText("Personal question").click();
      });
      H.visualize();
      H.tableInteractiveBody().findByText("39.72").should("be.visible");
    });
  });

  it("composite keys should act as filters on click (metabase#13717)", () => {
    cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
      semantic_type: "type/PK",
    });

    H.openOrdersTable();

    cy.get(".test-TableInteractive-cellWrapper--lastColumn") // Quantity (last in the default order for Sample Database)
      .eq(0) // first table body cell
      .should("contain", "2"); // quantity for order ID#1

    // Test was flaky due to long chain.
    cy.get(".test-TableInteractive-cellWrapper--lastColumn").eq(0).click();
    cy.wait("@dataset");

    cy.log(
      "**Reported at v0.34.3 - v0.37.0.2 / probably was always like this**",
    );
    cy.log(
      "**It should display the table with all orders with the selected quantity.**",
    );
    cy.findByTestId("filter-pill").should("have.text", "Quantity is 2");
    cy.findByTestId("object-detail").should("not.exist");
    H.tableInteractiveBody()
      .find(".test-TableInteractive-cellWrapper--firstColumn")
      .should("have.length.gt", 1);

    cy.get(".test-TableInteractive-cellWrapper--firstColumn") // ID (first in the default order for Sample Database)
      .eq(0) // first table body cell
      .should("contain", 1)
      .click();
    cy.wait("@dataset");

    cy.log("only one row should appear after filtering by ID");
    H.tableInteractiveBody()
      .find(".test-TableInteractive-cellWrapper--firstColumn")
      .should("have.length", 1);
  });

  it("should handle ad-hoc question with old syntax (metabase#15372)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: ["=", ["field-id", ORDERS.USER_ID], 1],
        },
        database: SAMPLE_DB_ID,
      },
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User ID is 1");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("37.65");
  });

  it(
    "should be able to save a question to a collection created on the go",
    { tags: "@prerelease" },
    () => {
      H.visitCollection(THIRD_COLLECTION_ID);

      cy.findByLabelText("Navigation bar").findByText("New").click();
      H.popover().findByText("Question").click();
      H.miniPickerBrowseAll().click();
      H.pickEntity({ path: ["Our analytics", "Orders"] });
      cy.findByTestId("qb-header").findByText("Save").click();

      cy.log("should be able to tab through fields (metabase#41683)");
      // Since the submit button has initial focus on this modal, we need an extra tab to get past the modal close button
      cy.realPress("Tab").realPress("Tab").realPress("Tab");
      cy.findByLabelText("Description").should("be.focused");

      cy.log(
        "should suggest the collection the question was started in over a recent dashboard (metabase#51851)",
      );
      cy.findByTestId("save-question-modal")
        .findByLabelText(/Where do you want to save/)
        .should("have.text", "Third collection")
        .click();

      H.entityPickerModal()
        .button("New collection")
        .should("be.enabled")
        .click();

      const NEW_COLLECTION = "Foo";
      H.collectionOnTheGoModal().within(() => {
        cy.findByLabelText(/Give it a name/).type(NEW_COLLECTION);
        cy.findByText("Create").click();
      });
      H.entityPickerModal().within(() => {
        cy.findByText("Foo").click();
        cy.button(/Select/).click();
      });
      cy.findByTestId("save-question-modal").within(() => {
        cy.findByText("Save new question");
        cy.findByLabelText(/Where do you want to save/).should(
          "have.text",
          NEW_COLLECTION,
        );
        cy.findByText("Save").click();
      });

      cy.get("header").findByText(NEW_COLLECTION);

      cy.log("the question is saved in the new collection");
      cy.reload();
      cy.get("header").findByText(NEW_COLLECTION);
    },
  );

  describe("add to a dashboard", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/card").as("createQuestion");
      cy.intercept("POST", "/api/dashboard").as("createDashboard");
      // Can't use `startNewQuestion` because it's missing `display: "table"` and
      // adding that will fail a lot of other tests and I don't want to deal with that yet.
      cy.visit("/");
      cy.findByTestId("app-bar").button("New").click();
      H.popover().findByText("Question").click();

      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });

      H.queryBuilderHeader().button("Save").click();

      cy.findByTestId("save-question-modal").within(() => {
        cy.findByLabelText(/Where do you want to save/).click();
      });

      H.pickEntity({
        path: ["Our analytics"],
        select: true,
      });

      cy.findByTestId("save-question-modal").within(() => {
        cy.findByText("Save").click();
        cy.wait("@createQuestion");
      });
      cy.findByTestId("save-question-modal").should("not.exist");

      H.checkSavedToCollectionQuestionToast(true);
    });

    it("should create a new dashboard in a collection with no child dashboards (metabase#47000)", () => {
      H.entityPickerModal().within(() => {
        cy.findByText("Add this question to a dashboard").should("be.visible");
        H.pickEntity({ path: ["Our analytics", "First collection"] });
        cy.button(/New dashboard/).click();
      });

      cy.findByRole("dialog", { name: "Create a new dashboard" }).within(() => {
        cy.findByRole("textbox").type("New Dashboard");
        cy.button("Create").click();
      });

      H.entityPickerModalItem(1, "First collection").should(
        "have.attr",
        "data-active",
        "true",
      );

      H.entityPickerModalItem(2, "New Dashboard").should(
        "have.attr",
        "data-active",
        "true",
      );

      H.entityPickerModal()
        .button(/Select/)
        .click();
      cy.wait("@createDashboard").then(({ response }) => {
        cy.location("pathname").should(
          "eq",
          `/dashboard/${response?.body.id}-new-dashboard`,
        );
      });
    });
  });
});

// the data picker has different behavior if there are no models in the instance
// the default instance image has a model in it, so we need to separately test the
// model-less behavior
describe(
  "scenarios > question > new > data picker > without models",
  { tags: ["@OSS", "@prerelease"] },
  () => {
    beforeEach(() => {
      H.restore("without-models");
      cy.signInAsAdmin();
    });

    it("can create a question from the sample database or a saved question, and shows models and raw data options after creating a model", () => {
      cy.visit("/question/new");

      H.miniPickerBrowseAll().click();
      H.pickEntity({ path: ["Databases", "Sample Database", "Products"] });

      // strange: we get different behavior when we go to question/new
      cy.findAllByTestId("run-button").first().click();

      H.tableInteractive().within(() => {
        cy.findByText("Rustic Paper Wallet").should("be.visible");
      });

      cy.visit("/question/new");

      H.miniPickerBrowseAll().click();
      H.pickEntity({ path: ["Our analytics", "Orders"] });

      // strange: we get different behavior when we go to question/new
      cy.findAllByTestId("run-button").first().click();

      H.tableInteractive().within(() => {
        cy.findByText(39.72).should("be.visible");
      });

      H.createQuestion({
        name: "Orders Model",
        query: { "source-table": ORDERS_ID },
        type: "model",
      });

      cy.intercept("POST", "/api/activity/recents").as("recents");

      cy.visit("/question/notebook");

      H.miniPickerBrowseAll().click();
      H.pickEntity({ path: ["Our analytics", "Orders Model"] });

      cy.wait("@recents");

      cy.button(/Orders Model/).click();
      H.miniPickerHeader().click();

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        cy.findByText("Recent items").click();
        // Recents are sorted newest first, and the model was picked last
        cy.findAllByTestId("result-item")
          .first()
          .should("contain.text", "Orders Model");
      });
    });
  },
);
