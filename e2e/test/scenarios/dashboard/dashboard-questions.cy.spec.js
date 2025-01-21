import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import * as S from "e2e/support/cypress_sample_instance_data";

describe("Dashboard > Dashboard Questions", () => {
  beforeEach(() => {
    cy.restore();
  });

  describe("admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      cy.setTokenFeatures("all");
    });

    it("can save a new question to a dashboard and move it to a collection", () => {
      // visit dash first to set it as recently opened
      cy.visit(`/dashboard/${S.ORDERS_DASHBOARD_ID}`);

      cy.newButton("Question").click();
      cy.entityPickerModalTab("Collections").click();
      cy.entityPickerModal().findByText("Orders Model").click();
      cy.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      cy.popover().findByText("Discount").click();
      cy.findByPlaceholderText("Min").type("1");
      cy.popover().button("Add filter").click();
      cy.button("Visualize").click();

      cy.findByTestId("qb-save-button").click();
      cy.modal().findByLabelText("Name").clear().type("Orders with a discount");
      cy.modal().findByText("Orders in a dashboard");
      cy.modal().button("Save").click();

      // should take you to the edit dashboard screen + url has hash param to auto-scroll
      cy.url().should("include", "/dashboard/");
      cy.location("hash").should("match", /scrollTo=\d+/); // url should have hash param to auto-scroll
      cy.dashboardCards().findByText("Orders with a discount");
      cy.findByTestId("edit-bar").findByText("You're editing this dashboard.");

      // we can't use the save dashboard util, because we're not actually saving any changes
      cy.findByTestId("edit-bar").button("Save").click();
      cy.findByTestId("edit-bar").should("not.exist");

      cy.dashboardCards().findByText("Orders with a discount").click();
      cy.url().should("include", "/question");
      // breadcrumb should say the dashboard name
      cy.appBar().findByText("Orders in a dashboard");
      cy.openQuestionActions();
      cy.popover().findByText("Move").click();
      cy.entityPickerModalTab("Browse").click();
      cy.entityPickerModal().findByText("First collection").click();
      cy.entityPickerModal().button("Move").click();

      cy.modal().findByText(/do you still want this question to appear/i);
      // defaults to yes
      cy.modal().button("Done").click();
      cy.undoToast().findByText("First collection");
      cy.appBar().findByText("First collection"); // breadcrumb should change
      cy.appBar().findByText("Orders in a dashboard").should("not.exist"); // dashboard name should no longer be visible

      // card should still be visible in dashboard
      cy.visit(`/dashboard/${S.ORDERS_DASHBOARD_ID}`);
      cy.dashboardCards().findByText("Orders with a discount");
    });

    it("can move an existing question between a dashboard and a collection", () => {
      cy.createQuestion({
        name: "Total Orders that should stay",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      cy.createQuestion(
        {
          name: "Total Orders",
          collection_id: S.FIRST_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "scalar",
        },
        { visitQuestion: true, wrapId: true, idAlias: "myQuestionId" },
      );

      cy.openQuestionActions();
      cy.popover().findByText("Move").click();
      cy.entityPickerModalTab("Browse").click();
      cy.entityPickerModal().findByText("Orders in a dashboard").click();
      cy.entityPickerModal().button("Move").click();
      cy.undoToast().findByText("Orders in a dashboard");
      cy.findByTestId("edit-bar").button("Save").click();

      cy.dashboardCards().findByText("Total Orders").click();
      cy.openQuestionActions();
      cy.popover().findByText("Turn into a model").should("not.exist");
      cy.popover().findByText("Add to dashboard").should("not.exist");
      cy.findByLabelText("Navigation bar").should(
        "contain.text",
        "Orders in a dashboard",
      );

      cy.visit(`/collection/${S.FIRST_COLLECTION_ID}`);
      cy.collectionTable().within(() => {
        cy.findByText("Second collection");
        cy.findByText("Total Orders").should("not.exist");
      });

      cy.visitQuestion("@myQuestionId");

      cy.openQuestionActions();
      cy.popover().findByText("Move").click();
      cy.entityPickerModalTab("Browse").click();
      cy.entityPickerModal().findByText("First collection").click();
      cy.entityPickerModal().findByText("Second collection").click();
      cy.entityPickerModal().button("Move").click();
      cy.modal().within(() => {
        cy.findByText(/do you still want this question to appear/i);
        cy.findByText(/no, remove it/i).click();
        cy.button("Done").click();
      });

      cy.undoToast().findByText("Second collection");
      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.dashboardCards().findByText("Total Orders").should("not.exist");

      cy.log("test moving a question while keeping the dashcard");
      cy.dashboardCards().findByText("Total Orders that should stay").click();

      cy.openQuestionActions();
      cy.popover().findByText("Move").click();
      cy.entityPickerModalTab("Browse").click();
      cy.entityPickerModal().findByText("First collection").click();
      cy.entityPickerModal().findByText("Second collection").click();
      cy.entityPickerModal().button("Move").click();
      cy.modal().within(() => {
        cy.findByText(/do you still want this question to appear/i).should(
          "exist",
        );
        cy.findByRole("radio", {
          name: /Yes, it should still appear there/i,
        }).should("be.checked");
        cy.button("Done").click();
      });

      cy.undoToast().findByText("Second collection");
      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.dashboardCards()
        .findByText("Total Orders that should stay")
        .should("exist");
    });

    it("can move a dashboard question between dashboards", () => {
      cy.createDashboard(
        {
          name: "Another dashboard",
          collection_id: S.FIRST_COLLECTION_ID,
        },
        { wrapId: true, idAlias: "anotherDashboardId" },
      );

      cy.get("@anotherDashboardId").then(anotherDashboardId => {
        cy.createQuestion(
          {
            name: "Total Orders",
            dashboard_id: anotherDashboardId,
            query: {
              "source-table": SAMPLE_DATABASE.ORDERS_ID,
              aggregation: [["count"]],
            },
            display: "scalar",
          },
          { visitQuestion: true, wrapId: true, idAlias: "myQuestionId" },
        );
      });

      cy.appBar().findByText("Another dashboard");

      cy.openQuestionActions();
      cy.popover().findByText("Move").click();
      cy.entityPickerModalTab("Browse").click();
      cy.entityPickerModal().findByText("Our analytics").click();
      cy.entityPickerModal().findByText("Orders in a dashboard").click();

      cy.entityPickerModal().button("Move").click();
      cy.modal().within(() => {
        cy.findByText(
          /Moving this question to another dashboard will remove it/i,
        );
        cy.button("Okay").click();
      });

      // its in the new dash + url has hash param to auto-scroll
      cy.url().should("include", "/dashboard/");
      cy.location("hash").should("match", /scrollTo=\d+/); // url should have hash param to auto-scroll
      cy.undoToast().findByText("Orders in a dashboard");
      cy.dashboardCards().findByText("Total Orders").should("be.visible");

      // and not in the old dash
      cy.visitDashboard("@anotherDashboardId");
      cy.dashboardCards().findByText("Total Orders").should("not.exist");
    });

    it("can bulk move questions into a dashboard", () => {
      cy.intercept("PUT", "/api/card/*").as("updateCard");

      new Array(20).fill("pikachu").forEach((_, i) => {
        cy.createQuestion({
          name: `Question ${i + 1}`,
          collection_id: S.THIRD_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.PRODUCTS_ID,
            limit: i + 1,
          },
          display: "scalar",
        });
      });

      cy.visitCollection(S.THIRD_COLLECTION_ID);

      cy.collectionTable().findByLabelText("Select all items").click();

      cy.findByTestId("toast-card").button("Move").click();
      cy.entityPickerModal().findByText(/Move 20 items/);
      cy.entityPickerModal().findByText("Orders in a dashboard").click();
      cy.entityPickerModal().button("Move").click();

      // we shouldn't be making 20 requests here
      cy.wait(new Array(20).fill("@updateCard"));

      cy.undoToast().findByText("Moved 20 questions");

      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);

      new Array(20).fill("slowbro").forEach((_, i) => {
        cy.dashboardCards().findByText(`Question ${i + 1}`);
      });

      // add coverage for a previous bug where moving 2 or more questions where at least one was not used by any
      // dashboard and another was would cause a runtime error and show an error boundary around collection items
      cy.log(
        "can bulk move in items where some already exist in the dashboard",
      );
      cy.visitCollection("root");
      cy.collectionTable().within(() => {
        selectCollectionItem("Orders");
        selectCollectionItem("Orders, Count");
      });
      cy.findByTestId("toast-card").button("Move").click();
      cy.entityPickerModal().findByText(/Move 2 items/);
      cy.entityPickerModal().findByText("Orders in a dashboard").click();
      cy.entityPickerModal().button("Move").click();

      cy.wait(["@updateCard", "@updateCard"]);
      cy.findByTestId("error-boundary").should("not.exist");
      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.dashboardCards().findByText("Orders");
      cy.dashboardCards().findByText("Orders, Count");
    });

    it("should tell users which dashboards will be affected when doing bulk question moves", () => {
      cy.createQuestionAndDashboard({
        questionDetails: {
          name: "Sample Question",
          collection_id: S.THIRD_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.PRODUCTS_ID,
            limit: 1,
          },
          display: "scalar",
        },
        dashboardDetails: {
          collection_id: S.THIRD_COLLECTION_ID,
          name: "Test Dashboard",
        },
      });

      cy.visitCollection(S.THIRD_COLLECTION_ID);
      selectCollectionItem("Sample Question");

      cy.findByTestId("toast-card").button("Move").click();

      cy.entityPickerModal().within(() => {
        cy.findByRole("button", { name: /Orders in a dashboard/ }).click();
        cy.button("Move").click();
      });

      cy.findByRole("dialog", { name: /Move this question/ }).should("exist");

      cy.modal().within(() => {
        cy.findByText("Sample Question").should("exist");
        cy.findByText("Test Dashboard").should("exist");

        cy.button("Move it").should("exist").click();
      });

      cy.collectionTable().findByText("Test Dashboard").click();

      cy.findByTestId("dashboard-empty-state")
        .findByText("This dashboard is looking empty.")
        .should("exist");

      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.dashboardCards().findByText("Sample Question").should("exist");
    });

    it("can edit a dashboard question", () => {
      cy.intercept("PUT", "/api/card/*").as("updateCard");
      cy.createQuestion(
        {
          name: "Total Orders",
          dashboard_id: S.ORDERS_DASHBOARD_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "scalar",
        },
        { visitQuestion: true },
      );

      cy.appBar().findByText("Orders in a dashboard");

      cy.queryBuilderHeader().button("Summarize").click();
      cy.rightSidebar().findByText("Count").click();
      cy.popover()
        .findByText(/Average of/)
        .click();
      cy.popover().findByText("Total").click();
      cy.saveSavedQuestion();

      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.dashboardCards().findByText("Total Orders");
      cy.dashboardCards().findByText("80.52");
    });

    it("can save a question directly to a dashboard", () => {
      cy.createDashboard(
        {
          name: "Test Dash",
          collection_id: S.THIRD_COLLECTION_ID,
        },
        { wrapId: true },
      );

      cy.get("@dashboardId").then(dashboardId => {
        //Simulate having picked the dashboard in the entity picker previously
        cy.request("POST", "/api/activity/recents", {
          context: "selection",
          model: "dashboard",
          model_id: dashboardId,
        });
      });

      cy.visit("/");

      cy.findByLabelText("Navigation bar").findByText("New").click();
      cy.popover().findByText("Question").click();
      cy.entityPickerModal().within(() => {
        cy.entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      cy.findByTestId("qb-header").findByText("Save").click();
      cy.findByLabelText(/Where do you want to save/).should(
        "have.text",
        "Test Dash",
      );

      cy.modal().button("Save").click();

      cy.findByTestId("edit-bar")
        .findByText("You're editing this dashboard.")
        .should("exist");
    });

    it("can save a native question to a dashboard", { tags: "@flaky" }, () => {
      cy.startNewNativeQuestion({ query: "SELECT 123" });

      cy.queryBuilderHeader().button("Save").click();
      cy.modal().within(() => {
        cy.findByLabelText("Name").type("Half Orders");
        cy.findByText("Orders in a dashboard"); // save location
        cy.button("Save").click();
      });

      cy.findByTestId("edit-bar").button("Save").click();
      cy.dashboardCards().findByText("Half Orders");
    });

    it("can create a question using a dashboard question as a data source", () => {
      cy.createQuestion({
        name: "Total Orders Dashboard Question",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      cy.startNewQuestion();
      cy.entityPickerModalTab("Collections").click();
      cy.entityPickerModal().findByText("Orders in a dashboard").click();
      cy.entityPickerModal()
        .findByText("Total Orders Dashboard Question")
        .click();
      cy.visualize();
      cy.findByTestId("query-visualization-root").findByText("18,760");
    });

    it("can find dashboard questions in the search", () => {
      cy.createQuestion({
        name: "Total Orders Dashboard Question",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      cy.visit("/");

      cy.commandPaletteSearch("Total Orders", false);

      cy.log("Command palette should show the dashboard question");
      cy.commandPalette()
        .findByText("Total Orders Dashboard Question")
        .should("be.visible");

      cy.log(
        "Command palette should show the dashboard question in the dashboard",
      );
      cy.commandPalette()
        .findByText("Total Orders Dashboard Question")
        .parent()
        .findByText(/Orders in a dashboard/)
        .should("be.visible");
      cy.closeCommandPalette();

      cy.log("Search page should show the dashboard question in the dashboard");
      cy.commandPaletteSearch("Total Orders");
      cy.commandPalette().should("not.exist");

      cy.findAllByTestId("search-result-item")
        .contains(
          "[data-testid=search-result-item]",
          "Total Orders Dashboard Question",
        )
        .findByRole("link", { name: /Orders in a dashboard/ })
        .should("be.visible");
    });

    it("can move a question into a dashboard that already has a dashcard with the same question", () => {
      cy.intercept("POST", "/api/cards/dashboards").as("cardDashboards");
      cy.visitQuestion(S.ORDERS_QUESTION_ID);
      cy.openQuestionActions();
      cy.popover().findByText("Move").click();
      cy.entityPickerModal().findByText("Orders in a dashboard").click();
      cy.entityPickerModal().button("Move").click();
      // Quick check to ensure that the move confirmation modal doesn't hang around
      cy.wait("@cardDashboards");
      cy.modal().should("not.exist");
      // should only have one instance of this card
      cy.dashboardCards().findAllByText("Orders").should("have.length", 1);
    });

    it("can share a dashboard card via public link", { tags: "@flaky" }, () => {
      cy.createQuestion(
        {
          name: "Total Orders",
          dashboard_id: S.ORDERS_DASHBOARD_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "scalar",
        },
        { visitQuestion: true },
      );

      cy.openSharingMenu("Create a public link");
      cy.findByTestId("public-link-input")
        .invoke("val")
        .then(publicLink => {
          cy.signOut();
          cy.visit(publicLink);
          cy.findByTestId("embed-frame-header")
            .findByText("Total Orders")
            .should("be.visible");
        });
    });

    it("preserves bookmarks when moving a question to a dashboard", () => {
      // bookmark it
      cy.visitQuestion(S.ORDERS_QUESTION_ID);
      cy.queryBuilderHeader().icon("bookmark").click();
      cy.findByTestId("sidebar-toggle").click();
      cy.navigationSidebar().findByText("Orders");
      cy.openQuestionActions();

      // move it
      cy.popover().findByText("Move").click();
      cy.navigationSidebar().findByText("Orders");
      cy.entityPickerModal().findByText("Orders in a dashboard").click();
      cy.entityPickerModal().button("Move").click();
      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      // it's still bookmarked
      cy.findByTestId("sidebar-toggle").click();
      cy.navigationSidebar().findByText("Orders");
      cy.dashboardCards().findByText("Orders").click();

      // unbookmark it
      cy.queryBuilderHeader().icon("bookmark_filled").click();
      cy.findByTestId("sidebar-toggle").click();
      cy.navigationSidebar().findByText("Collections").should("be.visible");
      cy.navigationSidebar().findByText("Orders").should("not.exist");

      // bookmark it again
      cy.queryBuilderHeader().icon("bookmark").click();
      cy.navigationSidebar().findByText("Collections").should("be.visible");
      cy.navigationSidebar().findByText("Orders").should("be.visible");
    });

    it("can delete a question from a dashboard without deleting all of the questions in metabase", () => {
      cy.createQuestion({
        name: "Total Orders",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      cy.createQuestion(
        {
          name: "Total Orders deleted",
          dashboard_id: S.ORDERS_DASHBOARD_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "scalar",
        },
        { wrapId: true, idAlias: "deletedCardId" },
      );

      // there has to be a card already in the trash from this dashboard for this to reproduce
      cy.get("@deletedCardId").then(deletedCardId => {
        cy.request("PUT", `/api/card/${deletedCardId}`, { archived: true });
      });

      // check that the 2 cards are there
      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.dashboardCards().findByText("Total Orders");
      cy.dashboardCards().findByText("Orders");

      // remove the card saved inside the dashboard
      cy.editDashboard();
      cy.dashboardCards().findByText("Total Orders").realHover();
      cy.icon("close").last().click();
      cy.undoToast().findByText("Removed card");
      cy.saveDashboard();

      // check that we didn't accidentally delete everything
      cy.dashboardCards().findByText("Total Orders").should("not.exist");
      cy.dashboardCards().findByText("Orders").should("be.visible");
    });

    it("can archive and unarchive a dashboard with cards saved inside it", () => {
      cy.createDashboard(
        {
          name: "Dashboard with a title",
        },
        { wrapId: true, idAlias: "dashboardWithTitleId" },
      );

      cy.get("@dashboardWithTitleId").then(dashboardId => {
        // add a text card to the dashboard
        cy.visitDashboard(dashboardId);
        cy.editDashboard();
        // note: we had a bug where archiving a dashboard with a text card first would crash
        cy.addHeadingWhileEditing("A section");
        cy.saveDashboard();

        cy.createQuestion({
          name: "Total Orders",
          dashboard_id: dashboardId,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "scalar",
        });

        cy.createQuestion({
          name: "More Total Orders",
          dashboard_id: dashboardId,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "scalar",
        });

        cy.visitDashboard(dashboardId);
        cy.openDashboardMenu("Move to trash");
        cy.modal().button("Move to trash").click();

        cy.findByText(/gone wrong/, { timeout: 0 }).should("not.exist");

        cy.findByTestId("archive-banner").findByText(/is in the trash/);
        cy.findByTestId("sidebar-toggle").click();

        // restore it
        cy.navigationSidebar().findByText("Trash").click();
        cy.collectionTable().findByText("Dashboard with a title");
        cy.openCollectionItemMenu("Dashboard with a title");
        cy.popover().findByText("Restore").click();

        // it's back
        cy.visitDashboard(dashboardId);
        cy.findByTestId("archive-banner").should("not.exist");

        // all the cards are there too
        cy.dashboardCards().findByText("Total Orders");
        cy.dashboardCards().findByText("More Total Orders");
        cy.dashboardCards().findByText("A section");
      });
    });

    it("can archive and unarchive a card within a dashboard", () => {
      cy.createQuestion({
        name: "Total Orders",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      cy.createQuestion({
        name: "More Total Orders",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      // archive it
      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.dashboardCards().findByText("Total Orders").click();
      cy.openQuestionActions("Move to trash");
      cy.modal().button("Move to trash").click();

      // check that it got removed
      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.dashboardCards().findByText("Total Orders").should("not.exist");

      // restore it
      cy.visit("/trash");
      cy.collectionTable().findByText("Total Orders");
      cy.openCollectionItemMenu("Total Orders");
      cy.popover().findByText("Restore").click();
      cy.undoToast().findByText("Total Orders has been restored.");

      // check that it got restored
      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.dashboardCards().findByText("Total Orders");
    });

    it("notifies the user about dashboards and dashcard series that a question will be removed from", () => {
      cy.createQuestion(
        {
          name: "Average Quantity by Month Question",
          collection_id: S.FIRST_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [
              [
                "avg",
                [
                  "field",
                  SAMPLE_DATABASE.ORDERS.QUANTITY,
                  { "base-type": "type/Integer" },
                ],
              ],
            ],
            breakout: [
              [
                "field",
                SAMPLE_DATABASE.ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
          display: "line",
        },
        {
          wrapId: true,
          idAlias: "avgQuanityQuestionId",
        },
      );

      cy.createQuestion(
        {
          name: "Average Order Total by Month Question",
          collection_id: S.FIRST_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [
              [
                "avg",
                [
                  "field",
                  SAMPLE_DATABASE.ORDERS.TOTAL,
                  { "base-type": "type/Float" },
                ],
              ],
            ],
            breakout: [
              [
                "field",
                SAMPLE_DATABASE.ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
          display: "line",
        },
        {
          wrapId: true,
          idAlias: "avgTotalQuestionId",
        },
      );

      cy.createDashboard(
        {
          name: "Blue Dashboard",
          collection_id: S.FIRST_COLLECTION_ID,
        },
        { wrapId: true, idAlias: "blueDashboardId" },
      );

      cy.createDashboard(
        {
          name: "Purple Dashboard",
          collection_id: S.FIRST_COLLECTION_ID,
        },
        { wrapId: true, idAlias: "purpleDashboardId" },
      );

      cy.get("@blueDashboardId").then(blueDashboardId => {
        cy.visitDashboard(blueDashboardId);
      });

      // add the quanity question to the blue dashboard
      cy.editDashboard();
      cy.openQuestionsSidebar();

      cy.sidebar().findByText("First collection").click();
      cy.sidebar().findByText("Average Quantity by Month Question").click();
      cy.saveDashboard();

      cy.get("@purpleDashboardId").then(purpleDashboardId => {
        cy.visitDashboard(purpleDashboardId);
      });

      // add the total question to the purple dashboard
      cy.editDashboard();
      cy.openQuestionsSidebar();

      cy.sidebar().findByText("First collection").click();
      cy.sidebar().findByText("Average Order Total by Month Question").click();

      // overlay the quantity series in the purple dashboard
      cy.showDashboardCardActions(0);
      cy.findByLabelText("Add series").click();

      cy.modal().findByLabelText("Average Quantity by Month Question").click();
      cy.modal().button("Done").click();
      cy.saveDashboard();
      cy.dashboardCards()
        .findByText(/Average Quantity by Month/)
        .should("be.visible");

      // move the quantity question to an entirely different dashboard
      cy.visitQuestion("@avgQuanityQuestionId");
      cy.openQuestionActions("Move");

      cy.entityPickerModalTab("Browse").click();
      cy.entityPickerModal().findByText("Orders in a dashboard").click();
      cy.entityPickerModal().button("Move").click();

      let shouldError = true;

      // Simulate an error to ensure that it's passed back and shown in the modal.
      cy.get("@avgQuanityQuestionId").then(questionId => {
        cy.intercept("PUT", `**/api/card/${questionId}**`, req => {
          if (shouldError === true) {
            shouldError = false;
            req.reply({
              statusCode: 400,
              body: {
                message: "Ryan said no",
              },
            });
          } else {
            req.continue();
          }
        });
      });

      // should warn about removing from 2 dashboards
      cy.modal().within(() => {
        cy.findByText(/will be removed from/i);
        cy.findByText(/purple dashboard/i);
        cy.findByText(/blue dashboard/i);
        cy.button("Move it").click();
        cy.findByText("Ryan said no");

        //Continue with the expected behavior
        cy.button("Move it").click();
      });

      cy.get("@purpleDashboardId").then(purpleDashboardId => {
        cy.visitDashboard(purpleDashboardId);
      });

      //Wait for dashcard to load
      cy.dashboardCards().findByText("Created At: Month").should("exist");

      cy.dashboardCards().should(
        "not.contain.text",
        "Average Quantity by Month Question",
      );
    });
  });

  describe("limited users", () => {
    it("cannot save dashboard question in a read only dashboard", () => {
      cy.signIn("readonlynosql");

      cy.intercept("POST", "/api/card").as("saveQuestion");
      cy.intercept("GET", "/api/dashboard/*").as("getADashboard");

      cy.visitDashboard(S.ORDERS_DASHBOARD_ID);
      cy.newButton("Question").click();
      cy.entityPickerModalTab("Tables").click();
      cy.entityPickerModal().findByText("Products").click();
      cy.queryBuilderHeader().button("Save").click();

      // should not show dashboard you can't write to
      cy.wait(["@getADashboard"]);

      cy.modal()
        .findByText(/Orders in a dashboard/)
        .should("not.exist");

      cy.modal().button("Save").click();

      cy.wait("@saveQuestion").then(({ response }) => {
        expect(response.statusCode).to.eq(200);
      });
    });

    it("cannot move a question to a dashboard, when it would be removed from a read-only dashboard", () => {
      cy.intercept("PUT", "/api/card/*").as("updateQuestion");
      cy.intercept("POST", "/api/cards/dashboards").as(
        "checkCardsInDashboards",
      );

      cy.signInAsAdmin();

      cy.createQuestion(
        {
          name: "Total Orders Question",
          collection_id: null, // our analytics
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "scalar",
        },
        {
          wrapId: true,
          idAlias: "totalOrdersQuestionId",
        },
      );

      cy.createDashboard(
        {
          name: "Personal dashboard",
          collection_id: S.ADMIN_PERSONAL_COLLECTION_ID,
        },
        { wrapId: true, idAlias: "personalDashboardId" },
      );

      cy.get("@personalDashboardId").then(personalDashboardId => {
        cy.visitDashboard(personalDashboardId);
      });

      cy.editDashboard();
      cy.openQuestionsSidebar();
      cy.sidebar()
        .findByText(/our analyt/i)
        .click();
      cy.sidebar().findByText("Total Orders Question").click();
      cy.saveDashboard();
      cy.dashboardCards().findByText("Total Orders Question");

      cy.signOut();
      cy.signIn("normal");

      cy.get("@totalOrdersQuestionId").then(totalOrdersQuestionId => {
        cy.visitQuestion(totalOrdersQuestionId);
      });

      cy.openQuestionActions();
      cy.popover().findByText("Move").click();
      cy.entityPickerModal().findByText("Orders in a dashboard").click();
      cy.entityPickerModal().button("Move").click();

      cy.log(
        "We should get a modal saying that we can't move it into a dashboard because it would move it out of a dashboard that we can't access",
      );

      cy.wait("@checkCardsInDashboards");
      cy.main()
        .findByText(/Sorry, you don’t have permission to see that./)
        .should("not.exist");
      cy.modal()
        .findByText(/Can't move this question into a dashboard/i)
        .should("be.visible");
    });
  });
});

function selectCollectionItem(name) {
  cy.findAllByTestId("collection-entry-name")
    .contains(name)
    .parent()
    .parent()
    .findByRole("checkbox")
    .click();
}
