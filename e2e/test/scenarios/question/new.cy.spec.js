const { H } = cy;
import { SAMPLE_DB_ID, USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SECOND_COLLECTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// test various entry points into the query builder

describe("scenarios > question > new", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("data picker", () => {
    it("data selector popover should not be too small (metabase#15591)", () => {
      // Add 10 more databases
      for (let i = 0; i < 10; i++) {
        cy.addSQLiteDatabase({ name: "Sample" + i });
      }

      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Sample3").should("be.visible");
      });
    });

    it("new question data picker search should work for both saved questions and database tables", () => {
      cy.intercept("GET", "/api/search?q=*", cy.spy().as("searchQuery")).as(
        "search",
      );

      H.startNewQuestion();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalLevel(0)
          .findByText(/Search results for /)
          .should("not.exist");
        H.entityPickerModalItem(0, "Our analytics").click();

        cy.findByPlaceholderText("Search…").type("  ").blur();
        cy.findByPlaceholderText("Search…").type("ord");
        cy.wait("@search");
        // should not trigger search for an empty string
        cy.get("@searchQuery").should("have.been.calledOnce");

        H.entityPickerModalLevel(0)
          .findByText(/Search results for /)
          .should("be.visible");

        [
          "Orders, Count", //question
          "Orders Model", //model
          "Orders", //table
        ].forEach((text) => {
          cy.findAllByText(text).should("have.length.at.least", 1);
        });

        // Discarding the search query should take us back to the original tab
        cy.findByPlaceholderText("Search…").clear().blur();
        cy.get("[role='tab']:contains('Search')").should("not.exist");

        cy.findByText("Orders, Count").click();
      });

      cy.log("toggle notebook button should be hidden for brand new questions");
      H.notebookButton().should("not.exist");

      H.visualize();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18,760");
      // should reopen saved question picker after returning back to editor mode
      H.openNotebook();

      H.notebookButton().should("be.visible");

      cy.findByTestId("data-step-cell").contains("Orders, Count").click();
      H.miniPickerHeader().click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        // It is now possible to choose another saved question
        H.entityPickerModalItem(0, "Our analytics").should(
          "have.attr",
          "data-active",
          "true",
        );
        cy.findByText("Orders").should("exist");
        cy.findByText("Orders, Count").should("exist");

        H.pickEntity({ path: ["Databases", "Sample Database", "Products"] });
      });
      cy.findByTestId("data-step-cell").contains("Products");
      H.visualize();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Rustic Paper Wallet");
    });

    it("should suggest questions saved in collections with colon in their name (metabase#14287)", () => {
      cy.request("POST", "/api/collection", {
        name: "foo:bar",
        parent_id: null,
      }).then(({ body: { id: COLLECTION_ID } }) => {
        // Move question #1 ("Orders") to newly created collection
        cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
          collection_id: COLLECTION_ID,
        });
        // Sanity check: make sure Orders is indeed inside new collection
        cy.visit(`/collection/${COLLECTION_ID}`);
        cy.findByText("Orders");
      });

      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        // Note: collection name's first letter is capitalized
        cy.findByText(/foo:bar/i).click();
        cy.findByText("Orders");
      });
    });

    it("'Saved Questions' prompt should respect nested collections structure (metabase#14178)", () => {
      // Move first question in a DB snapshot ("Orders") to a "Second collection"
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: SECOND_COLLECTION_ID,
      });

      H.startNewQuestion();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Our analytics").click();
        cy.findByText("First collection").should("exist");
        cy.findByText("Second collection").should("not.exist");
        cy.findByText("Third collection").should("not.exist");

        cy.findByText("First collection").click();
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        cy.findByText("Second collection").should("exist");
        cy.findByText("Third collection").should("not.exist");

        cy.findByText("Second collection").click();
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, "Second collection");
        cy.findByText("Third collection").should("not.exist");
      });
    });

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

    H.tableInteractiveBody()
      .get(".test-TableInteractive-cellWrapper--firstColumn")
      .should("have.length.gt", 1);

    cy.log(
      "**Reported at v0.34.3 - v0.37.0.2 / probably was always like this**",
    );
    cy.log(
      "**It should display the table with all orders with the selected quantity.**",
    );
    H.tableInteractive();

    cy.get(".test-TableInteractive-cellWrapper--firstColumn") // ID (first in the default order for Sample Database)
      .eq(0) // first table body cell
      .should("contain", 1)
      .click();
    cy.wait("@dataset");

    cy.log("only one row should appear after filtering by ID");
    H.tableInteractiveBody()
      .get(".test-TableInteractive-cellWrapper--firstColumn")
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

  it("should suggest the currently viewed dashboard when saving question", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.findByLabelText("Navigation bar").within(() => {
      cy.findByText("New").click();
    });

    H.popover().findByText("Question").click();

    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", "Sample Database", "Orders"] });

    cy.log(
      "The selected table should be saved and show in recents (metabase#45003)",
    );

    cy.findByRole("button", { name: /Orders/ }).click();
    H.miniPickerHeader().click();
    H.miniPickerBrowseAll().click();
    H.entityPickerModalItem(0, "Recent items").click();
    cy.findByRole("dialog", { name: "Pick your starting data" })
      .findByRole("button", { name: /Orders/ })
      .should("exist");
    cy.findByRole("dialog", { name: "Pick your starting data" })
      .findByRole("button", { name: /Close/ })
      .click();

    cy.findByTestId("qb-header").within(() => {
      cy.findByText("Save").click();
    });
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText(/Where do you want to save/).should(
        "have.text",
        "Orders in a dashboard",
      );
    });
  });

  it("should not suggest recent items where can_write=false when saving a question", () => {
    // SETUP TEST - prevent normal user from having access to third collection w/ added content
    cy.log("setup restricted permissions scenario");
    cy.signInAsAdmin();

    // create dashboard that will have restricted access
    H.createDashboard(
      {
        name: "Third collection dashboard",
        collection_id: THIRD_COLLECTION_ID,
      },
      { wrapId: true },
    );

    // restrict access to a collection
    cy.visit(`/admin/permissions/collections/${THIRD_COLLECTION_ID}`);
    H.selectPermissionRow("collection", 0);
    H.popover().within(() => {
      cy.findByText("View").click();
    });

    cy.intercept("PUT", "/api/collection/graph?skip-graph=true").as(
      "saveGraph",
    );
    cy.button("Save changes").click();
    H.modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });
    cy.wait("@saveGraph");

    // TEST STARTS HERE
    cy.log("start testing proper enforcement");
    cy.signIn("normal");
    cy.visit("/");

    // log recents
    cy.log("log recent views to items with can_write access");
    cy.log("visit valid recent item");
    logRecent("collection", SECOND_COLLECTION_ID); // report recent interaction for collection w/ write access
    logRecent("collection", THIRD_COLLECTION_ID); // report recent interaction for collection w/o write access
    logRecent("dashboard", ORDERS_DASHBOARD_ID); // report recent interaction for dashboard w/ write access
    cy.get("@dashboardId").then((id) => {
      logRecent("dashboard", id); // report recent interaction for dashboard w/o write access
    });

    // test recent items do not exist
    H.startNewNativeQuestion();
    H.NativeEditor.type("select 'hi'");
    cy.findByTestId("native-query-editor-container")
      .button("Get Answer")
      .click();
    cy.findByRole("button", { name: "Save" }).click();

    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText(/Where do you want to save this/).click();
    });

    H.entityPickerModalItem(0, "Recent items").click();
    cy.log("test valid recents appear");
    H.entityPickerModalItem(1, "Second collection").should("exist");
    H.entityPickerModalItem(1, "Orders in a dashboard").should("exist");

    cy.log("test invalid recents do not appear");
    H.entityPickerModalItem(1, "Third collection").should(
      "have.attr",
      "data-disabled",
    );
    H.entityPickerModalItem(1, "Third collection dashboard").should(
      "have.attr",
      "data-disabled",
    );
  });

  it(
    "should be able to save a question to a collection created on the go",
    { tags: "@smoke" },
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

      cy.findByTestId("save-question-modal")
        .findByLabelText(/Where do you want to save/)
        .click();

      H.entityPickerModal().findByText("New collection").click();

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
    },
  );

  it(
    "should be able to save a question to a dashboard created on the go",
    { tags: "@smoke" },
    () => {
      H.visitCollection(THIRD_COLLECTION_ID);

      cy.findByLabelText("Navigation bar").findByText("New").click();
      H.popover().findByText("Question").click();

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        cy.findByText("Orders").click();
      });
      cy.findByTestId("qb-header").findByText("Save").click();

      cy.log("should be able to tab through fields (metabase#41683)");
      // Since the submit button has initial focus on this modal, we need an extra tab to get past the modal close button
      cy.realPress("Tab").realPress("Tab").realPress("Tab");
      cy.findByLabelText("Description").should("be.focused");

      cy.findByTestId("save-question-modal")
        .findByLabelText(/Where do you want to save/)
        .click();

      H.entityPickerModal()
        .findByRole("tab", { name: /Browse/ })
        .click();

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
      cy.findByTestId("save-question-modal").within(() => {
        cy.findByText("Save new question");
        cy.findByLabelText(/Where do you want to save/).should(
          "have.text",
          NEW_DASHBOARD,
        );
        cy.findByText("Save").click();
      });

      cy.get("header").findByText(NEW_DASHBOARD);
      cy.url().should("include", "/dashboard/");
    },
  );

  it("should preserve the original question name (metabase#41196)", () => {
    const originalQuestionName = "Foo";
    const modifiedQuestionName = `${originalQuestionName} - Modified`;
    const originalDescription = "Lorem ipsum dolor sit amet";

    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      name: originalQuestionName,
      description: originalDescription,
    });

    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
    cy.findByDisplayValue(originalQuestionName).should("exist");

    cy.log("Change anything about this question to make it dirty");
    H.tableHeaderClick("Count");
    H.popover().icon("arrow_down").click();

    cy.findByTestId("qb-header-action-panel").button("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByText("Save as new question").click();

      cy.findByLabelText("Name").should("have.value", modifiedQuestionName);
      cy.findByLabelText("Description").should(
        "have.value",
        originalDescription,
      );
    });
  });

  describe("add to a dashboard", () => {
    const collectionInRoot = {
      name: "Collection in root collection",
    };
    const dashboardInRoot = {
      name: "Dashboard in root collection",
    };
    const myPersonalCollectionName = "Bobby Tables's Personal Collection";

    beforeEach(() => {
      cy.intercept("POST", "/api/card").as("createQuestion");
      H.createCollection(collectionInRoot).then(({ body: { id } }) => {
        H.createDashboard({
          name: "Extra Dashboard",
          collection_id: id,
        });
      });
      H.createDashboard(dashboardInRoot);
      // Can't use `startNewQuestion` because it's missing `display: "table"` and
      // adding that will fail a lot of other tests and I don't want to deal with that yet.
      cy.visit("/");
      cy.findByTestId("app-bar").button("New").click();
      H.popover().findByText("Question").click();
    });

    it("should hide public collections when selecting a dashboard for a question in a personal collection", () => {
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });

      H.queryBuilderHeader().button("Save").click();
      cy.findByTestId("save-question-modal")
        .findByLabelText(/Where do you want to save/)
        .click();

      H.pickEntity({
        path: [myPersonalCollectionName],
        select: true,
      });

      cy.findByTestId("save-question-modal").button("Save").click();
      cy.wait("@createQuestion");

      cy.findByTestId("save-question-modal").should("not.exist");

      H.checkSavedToCollectionQuestionToast(true);

      H.entityPickerModal().within(() => {
        cy.findByText("Add this question to a dashboard").should("be.visible");
        cy.findByText(/bobby tables's personal collection/i).should(
          "be.visible",
        );
        cy.findByText(/our analytics/i).should("not.exist");
      });
    });

    it("should show all collections when selecting a dashboard for a question in a public collection", () => {
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });

      H.queryBuilderHeader().button("Save").click();
      cy.findByTestId("save-question-modal")
        .findByLabelText(/Where do you want to save/)
        .click();

      H.pickEntity({
        path: ["Our analytics"],
        select: true,
      });

      cy.findByTestId("save-question-modal").button("Save").click();
      cy.wait("@createQuestion");

      H.checkSavedToCollectionQuestionToast(true);

      H.entityPickerModal().within(() => {
        cy.findByText("Add this question to a dashboard").should("be.visible");

        cy.findByText("Bobby Tables's Personal Collection").should(
          "be.visible",
        );
        cy.findByText(collectionInRoot.name).should("be.visible");
        cy.findByText(dashboardInRoot.name).should("be.visible");
        cy.findByText("New dashboard").should("be.visible");
      });
    });

    describe("creating a new dashboard", () => {
      beforeEach(() => {
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("Orders").click();
        });

        H.queryBuilderHeader().button("Save").click();

        cy.findByTestId("save-question-modal").within((modal) => {
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

        H.checkSavedToCollectionQuestionToast(true);
      });

      it("when selecting a collection", () => {
        // H.miniPickerBrowseAll().click();
        H.entityPickerModal().within(() => {
          H.pickEntity({
            path: ["Our analytics", "Collection in root collection"],
          });
          cy.button(/New dashboard/).click();
        });

        cy.findByRole("dialog", { name: "Create a new dashboard" }).within(
          () => {
            cy.findByRole("textbox").type("New Dashboard");
            cy.button("Create").click();
          },
        );

        H.entityPickerModalItem(1, "Collection in root collection").should(
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
        cy.location("pathname").should("eq", "/dashboard/12-new-dashboard");
      });

      it("when selecting a collection with no child dashboards (metabase#47000)", () => {
        H.entityPickerModal().within(() => {
          H.pickEntity({ path: ["Our analytics", "First collection"] });
          cy.button(/New dashboard/).click();
        });

        cy.findByRole("dialog", { name: "Create a new dashboard" }).within(
          () => {
            cy.findByRole("textbox").type("New Dashboard");
            cy.button("Create").click();
          },
        );

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
        cy.location("pathname").should("eq", "/dashboard/12-new-dashboard");
      });

      it("when a dashboard is currently selected", () => {
        H.entityPickerModal().within(() => {
          H.pickEntity({ path: ["Our analytics", "Orders in a dashboard"] });
          cy.button(/New dashboard/).click();
        });

        cy.findByRole("dialog", { name: "Create a new dashboard" }).within(
          () => {
            cy.findByRole("textbox").type("New Dashboard");
            cy.button("Create").click();
          },
        );

        H.entityPickerModalItem(1, "New Dashboard").should(
          "have.attr",
          "data-active",
          "true",
        );

        H.entityPickerModal()
          .button(/Select/)
          .click();
        cy.location("pathname").should("eq", "/dashboard/12-new-dashboard");
      });
    });
  });
});

// the data picker has different behavior if there are no models in the instance
// the default instance image has a model in it, so we need to separately test the
// model-less behavior
describe(
  "scenarios > question > new > data picker > without models",
  { tags: ["@OSS", "@smoke"] },
  () => {
    beforeEach(() => {
      H.restore("without-models");
      cy.signInAsAdmin();
    });

    it("can create a question from the sample database", () => {
      cy.visit("/question/new");

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalLevel(0).findByText("Databases").click();
        H.entityPickerModalItem(3, "Products").click();
      });

      // strange: we get different behavior when we go to question/new
      cy.findAllByTestId("run-button").first().click();

      H.tableInteractive().within(() => {
        cy.findByText("Rustic Paper Wallet").should("be.visible");
      });
    });

    it("can create a question from a saved question", () => {
      cy.visit("/question/new");

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(1, "Orders").click();
      });

      // strange: we get different behavior when we go to question/new
      cy.findAllByTestId("run-button").first().click();

      H.tableInteractive().within(() => {
        cy.findByText(39.72).should("be.visible");
      });
    });

    it("shows models and raw data options after creating a model", () => {
      H.createQuestion({
        name: "Orders Model",
        query: { "source-table": ORDERS_ID },
        type: "model",
      });

      cy.intercept("POST", "/api/activity/recents").as("recents");

      cy.visit("/question/notebook");

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(1, "Orders Model").click();
      });

      cy.wait("@recents");

      cy.button(/Orders Model/).click();
      H.miniPickerHeader().click();

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        cy.findByText("Recent items").click();
        cy.findByTestId("result-item").should("contain.text", "Orders Model");
      });
    });
  },
);

function assertDataPickerEntitySelected(level, name) {
  H.entityPickerModalItem(level, name).should(
    "have.attr",
    "data-active",
    "true",
  );
}

function logRecent(model, model_id) {
  cy.request("POST", "/api/activity/recents", {
    context: "selection",
    model,
    model_id,
  });
}
