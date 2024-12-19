import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import * as S from "e2e/support/cypress_sample_instance_data";

describe("Dashboard > Dashboard Questions", () => {
  beforeEach(() => {
    H.restore();
  });

  describe("admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.setTokenFeatures("all");
    });

    it("can save a new question to a dashboard and move it to a collection", () => {
      // visit dash first to set it as recently opened
      cy.visit(`/dashboard/${S.ORDERS_DASHBOARD_ID}`);

      H.newButton("Question").click();
      H.entityPickerModalTab("Collections").click();
      H.entityPickerModal().findByText("Orders Model").click();
      H.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      H.popover().findByText("Discount").click();
      cy.findByPlaceholderText("Min").type("1");
      H.popover().button("Add filter").click();
      cy.button("Visualize").click();

      cy.findByTestId("qb-save-button").click();
      H.modal().findByLabelText("Name").clear().type("Orders with a discount");
      H.modal().findByText("Orders in a dashboard");
      H.modal().button("Save").click();

      // should take you to the edit dashboard screen
      cy.url().should("include", "/dashboard/");
      H.dashboardCards().findByText("Orders with a discount");
      cy.findByTestId("edit-bar").findByText("You're editing this dashboard.");

      // we can't use the save dashboard util, because we're not actually saving any changes
      cy.findByTestId("edit-bar").button("Save").click();
      cy.findByTestId("edit-bar").should("not.exist");

      H.dashboardCards().findByText("Orders with a discount").click();
      cy.url().should("include", "/question");
      // breadcrumb should say the dashboard name
      H.appBar().findByText("Orders in a dashboard");
      H.openQuestionActions();
      H.popover().findByText("Move").click();
      H.entityPickerModalTab("Browse").click();
      H.entityPickerModal().findByText("First collection").click();
      H.entityPickerModal().button("Move").click();

      H.modal().findByText(/do you still want this question to appear/i);
      // defaults to yes
      H.modal().button("Done").click();
      H.undoToast().findByText("First collection");
      H.appBar().findByText("First collection"); // breadcrumb should change

      // card should still be visible in dashboard
      cy.visit(`/dashboard/${S.ORDERS_DASHBOARD_ID}`);
      H.dashboardCards().findByText("Orders with a discount");
    });

    it("can move an existing question between a dashboard and a collection", () => {
      H.createQuestion({
        name: "Total Orders that should stay",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      H.createQuestion(
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

      H.openQuestionActions();
      H.popover().findByText("Move").click();
      H.entityPickerModalTab("Browse").click();
      H.entityPickerModal().findByText("Orders in a dashboard").click();
      H.entityPickerModal().button("Move").click();
      H.undoToast().findByText("Orders in a dashboard");
      cy.findByTestId("edit-bar").button("Save").click();

      H.dashboardCards().findByText("Total Orders").click();
      H.openQuestionActions();
      H.popover().findByText("Turn into a model").should("not.exist");
      H.popover().findByText("Add to dashboard").should("not.exist");
      cy.findByLabelText("Navigation bar").should(
        "contain.text",
        "Orders in a dashboard",
      );

      cy.visit(`/collection/${S.FIRST_COLLECTION_ID}`);
      H.collectionTable().within(() => {
        cy.findByText("Second collection");
        cy.findByText("Total Orders").should("not.exist");
      });

      H.visitQuestion("@myQuestionId");

      H.openQuestionActions();
      H.popover().findByText("Move").click();
      H.entityPickerModalTab("Browse").click();
      H.entityPickerModal().findByText("First collection").click();
      H.entityPickerModal().findByText("Second collection").click();
      H.entityPickerModal().button("Move").click();
      H.modal().within(() => {
        cy.findByText(/do you still want this question to appear/i);
        cy.findByText(/no, remove it/i).click();
        cy.button("Done").click();
      });

      H.undoToast().findByText("Second collection");
      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards().findByText("Total Orders").should("not.exist");

      cy.log("test moving a question while keeping the dashcard");
      H.dashboardCards().findByText("Total Orders that should stay").click();

      H.openQuestionActions();
      H.popover().findByText("Move").click();
      H.entityPickerModalTab("Browse").click();
      H.entityPickerModal().findByText("First collection").click();
      H.entityPickerModal().findByText("Second collection").click();
      H.entityPickerModal().button("Move").click();
      H.modal().within(() => {
        cy.findByText(/do you still want this question to appear/i).should(
          "exist",
        );
        cy.findByRole("radio", {
          name: /Yes, it should still appear there/i,
        }).should("be.checked");
        cy.button("Done").click();
      });

      H.undoToast().findByText("Second collection");
      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards()
        .findByText("Total Orders that should stay")
        .should("exist");
    });

    it("can move a dashboard question between dashboards", () => {
      H.createDashboard(
        {
          name: "Another dashboard",
          collection_id: S.FIRST_COLLECTION_ID,
        },
        { wrapId: true, idAlias: "anotherDashboardId" },
      );

      cy.get("@anotherDashboardId").then(anotherDashboardId => {
        H.createQuestion(
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

      H.appBar().findByText("Another dashboard");

      H.openQuestionActions();
      H.popover().findByText("Move").click();
      H.entityPickerModalTab("Browse").click();
      H.entityPickerModal().findByText("Our analytics").click();
      H.entityPickerModal().findByText("Orders in a dashboard").click();

      H.entityPickerModal().button("Move").click();
      H.modal().within(() => {
        cy.findByText(
          /Moving this question to another dashboard will remove it/i,
        );
        cy.button("Okay").click();
      });

      // its in the new dash
      H.undoToast().findByText("Orders in a dashboard");
      H.dashboardCards().findByText("Total Orders").should("be.visible");

      // and not in the old dash
      H.visitDashboard("@anotherDashboardId");
      H.dashboardCards().findByText("Total Orders").should("not.exist");
    });

    it("can bulk move questions into a dashboard", () => {
      cy.intercept("PUT", "/api/card/*").as("updateCard");

      new Array(20).fill("pikachu").forEach((_, i) => {
        H.createQuestion({
          name: `Question ${i + 1}`,
          collection_id: S.THIRD_COLLECTION_ID,
          query: {
            "source-table": SAMPLE_DATABASE.PRODUCTS_ID,
            limit: i + 1,
          },
          display: "scalar",
        });
      });

      H.visitCollection(S.THIRD_COLLECTION_ID);

      H.collectionTable().findByLabelText("Select all items").click();

      cy.findByTestId("toast-card").button("Move").click();
      H.entityPickerModal().findByText(/Move 20 items/);
      H.entityPickerModal().findByText("Orders in a dashboard").click();
      H.entityPickerModal().button("Move").click();

      // we shouldn't be making 20 requests here
      cy.wait(new Array(20).fill("@updateCard"));

      H.undoToast().findByText("Moved 20 questions");

      H.visitDashboard(S.ORDERS_DASHBOARD_ID);

      new Array(20).fill("slowbro").forEach((_, i) => {
        H.dashboardCards().findByText(`Question ${i + 1}`);
      });

      // add coverage for a previous bug where moving 2 or more questions where at least one was not used by any
      // dashboard and another was would cause a runtime error and show an error boundary around collection items
      cy.log(
        "can bulk move in items where some already exist in the dashboard",
      );
      H.visitCollection("root");
      H.collectionTable().within(() => {
        selectCollectionItem("Orders");
        selectCollectionItem("Orders, Count");
      });
      cy.findByTestId("toast-card").button("Move").click();
      H.entityPickerModal().findByText(/Move 2 items/);
      H.entityPickerModal().findByText("Orders in a dashboard").click();
      H.entityPickerModal().button("Move").click();

      cy.wait(["@updateCard", "@updateCard"]);
      cy.findByTestId("error-boundary").should("not.exist");
      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards().findByText("Orders");
      H.dashboardCards().findByText("Orders, Count");
    });

    it("should tell users which dashboards will be affected when doing bulk question moves", () => {
      H.createQuestionAndDashboard({
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

      H.visitCollection(S.THIRD_COLLECTION_ID);
      selectCollectionItem("Sample Question");

      cy.findByTestId("toast-card").button("Move").click();

      H.entityPickerModal().within(() => {
        cy.findByRole("button", { name: /Orders in a dashboard/ }).click();
        cy.button("Move").click();
      });

      cy.findByRole("dialog", { name: /Move this question/ }).should("exist");

      H.modal().within(() => {
        cy.findByText("Sample Question").should("exist");
        cy.findByText("Test Dashboard").should("exist");

        cy.button("Move it").should("exist").click();
      });

      H.collectionTable().findByText("Test Dashboard").click();

      cy.findByTestId("dashboard-empty-state")
        .findByText("This dashboard is looking empty.")
        .should("exist");

      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards().findByText("Sample Question").should("exist");
    });

    it("can edit a dashboard question", () => {
      cy.intercept("PUT", "/api/card/*").as("updateCard");
      H.createQuestion(
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

      H.appBar().findByText("Orders in a dashboard");

      H.queryBuilderHeader().button("Summarize").click();
      H.rightSidebar().findByText("Count").click();
      H.popover()
        .findByText(/Average of/)
        .click();
      H.popover().findByText("Total").click();
      H.saveSavedQuestion();

      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards().findByText("Total Orders");
      H.dashboardCards().findByText("80.52");
    });

    it("can save a question directly to a dashboard", () => {
      H.createDashboard(
        {
          name: "Test Dash",
          collection_id: S.THIRD_COLLECTION_ID,
        },
        { wrapId: true },
      );

      cy.get("@dashboardId").then(dashboardId => {
        H.visitDashboard(dashboardId);
      });

      cy.findByLabelText("Navigation bar").findByText("New").click();
      H.popover().findByText("Question").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      cy.findByTestId("qb-header").findByText("Save").click();
      cy.findByLabelText(/Where do you want to save/).should(
        "have.text",
        "Test Dash",
      );

      H.modal().button("Save").click();

      cy.findByTestId("edit-bar")
        .findByText("You're editing this dashboard.")
        .should("exist");
    });

    it("can save a native question to a dashboard", () => {
      cy.visit("/");
      H.newButton("SQL query").click();

      H.focusNativeEditor();
      cy.realType("SELECT COUNT(*) / 2 as half_count FROM ORDERS");

      H.queryBuilderHeader().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("Half Orders");
        cy.findByText("Orders in a dashboard"); // save location
        cy.button("Save").click();
      });

      cy.findByTestId("edit-bar").button("Save").click();
      H.dashboardCards().findByText("Half Orders");
    });

    it("can create a question using a dashboard question as a data source", () => {
      H.createQuestion({
        name: "Total Orders Dashboard Question",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      H.startNewQuestion();
      H.entityPickerModalTab("Collections").click();
      H.entityPickerModal().findByText("Orders in a dashboard").click();
      H.entityPickerModal()
        .findByText("Total Orders Dashboard Question")
        .click();
      H.visualize();
      cy.findByTestId("query-visualization-root").findByText("18,760");
    });

    it("can find dashboard questions in the search", () => {
      H.createQuestion({
        name: "Total Orders Dashboard Question",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      cy.visit("/");

      H.commandPaletteSearch("Total Orders", false);

      cy.log("Command palette should show the dashboard question");
      H.commandPalette()
        .findByText("Total Orders Dashboard Question")
        .should("be.visible");

      cy.log(
        "Command palette should show the dashboard question in the dashboard",
      );
      H.commandPalette()
        .findByText("Total Orders Dashboard Question")
        .parent()
        .findByText(/Orders in a dashboard/)
        .should("be.visible");
      H.closeCommandPalette();

      cy.log("Search page should show the dashboard question in the dashboard");
      H.commandPaletteSearch("Total Orders");
      H.commandPalette().should("not.exist");

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
      H.visitQuestion(S.ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Move").click();
      H.entityPickerModal().findByText("Orders in a dashboard").click();
      H.entityPickerModal().button("Move").click();
      // Quick check to ensure that the move confirmation modal doesn't hang around
      cy.wait("@cardDashboards");
      H.modal().should("not.exist");
      // should only have one instance of this card
      H.dashboardCards().findAllByText("Orders").should("have.length", 1);
    });

    it("can share a dashboard card via public link", () => {
      H.createQuestion(
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

      H.openSharingMenu("Create a public link");
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
      H.visitQuestion(S.ORDERS_QUESTION_ID);
      H.queryBuilderHeader().icon("bookmark").click();
      cy.findByTestId("sidebar-toggle").click();
      H.navigationSidebar().findByText("Orders");
      H.openQuestionActions();

      // move it
      H.popover().findByText("Move").click();
      H.navigationSidebar().findByText("Orders");
      H.entityPickerModal().findByText("Orders in a dashboard").click();
      H.entityPickerModal().button("Move").click();
      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      // it's still bookmarked
      cy.findByTestId("sidebar-toggle").click();
      H.navigationSidebar().findByText("Orders");
      H.dashboardCards().findByText("Orders").click();

      // unbookmark it
      H.queryBuilderHeader().icon("bookmark_filled").click();
      cy.findByTestId("sidebar-toggle").click();
      H.navigationSidebar().findByText("Collections").should("be.visible");
      H.navigationSidebar().findByText("Orders").should("not.exist");

      // bookmark it again
      H.queryBuilderHeader().icon("bookmark").click();
      H.navigationSidebar().findByText("Collections").should("be.visible");
      H.navigationSidebar().findByText("Orders").should("be.visible");
    });

    it("can delete a question from a dashboard without deleting all of the questions in metabase", () => {
      H.createQuestion({
        name: "Total Orders",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      H.createQuestion(
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
      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards().findByText("Total Orders");
      H.dashboardCards().findByText("Orders");

      // remove the card saved inside the dashboard
      H.editDashboard();
      H.dashboardCards().findByText("Total Orders").realHover();
      cy.icon("close").last().click();
      H.undoToast().findByText("Removed card");
      H.saveDashboard();

      // check that we didn't accidentally delete everything
      H.dashboardCards().findByText("Total Orders").should("not.exist");
      H.dashboardCards().findByText("Orders").should("be.visible");
    });

    it("can archive and unarchive a dashboard with cards saved inside it", () => {
      H.createDashboard(
        {
          name: "Dashboard with a title",
        },
        { wrapId: true, idAlias: "dashboardWithTitleId" },
      );

      cy.get("@dashboardWithTitleId").then(dashboardId => {
        // add a text card to the dashboard
        H.visitDashboard(dashboardId);
        H.editDashboard();
        // note: we had a bug where archiving a dashboard with a text card first would crash
        H.addHeadingWhileEditing("A section");
        H.saveDashboard();

        H.createQuestion({
          name: "Total Orders",
          dashboard_id: dashboardId,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "scalar",
        });

        H.createQuestion({
          name: "More Total Orders",
          dashboard_id: dashboardId,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
            aggregation: [["count"]],
          },
          display: "scalar",
        });

        H.visitDashboard(dashboardId);
        H.openDashboardMenu("Move to trash");
        H.modal().button("Move to trash").click();

        cy.findByText(/gone wrong/, { timeout: 0 }).should("not.exist");

        cy.findByTestId("archive-banner").findByText(/is in the trash/);
        cy.findByTestId("sidebar-toggle").click();

        // restore it
        H.navigationSidebar().findByText("Trash").click();
        H.collectionTable().findByText("Dashboard with a title");
        H.openCollectionItemMenu("Dashboard with a title");
        H.popover().findByText("Restore").click();

        // it's back
        H.visitDashboard(dashboardId);
        cy.findByTestId("archive-banner").should("not.exist");

        // all the cards are there too
        H.dashboardCards().findByText("Total Orders");
        H.dashboardCards().findByText("More Total Orders");
        H.dashboardCards().findByText("A section");
      });
    });

    it("can archive and unarchive a card within a dashboard", () => {
      H.createQuestion({
        name: "Total Orders",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      H.createQuestion({
        name: "More Total Orders",
        dashboard_id: S.ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      // archive it
      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards().findByText("Total Orders").click();
      H.openQuestionActions("Move to trash");
      H.modal().button("Move to trash").click();

      // check that it got removed
      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards().findByText("Total Orders").should("not.exist");

      // restore it
      cy.visit("/trash");
      H.collectionTable().findByText("Total Orders");
      H.openCollectionItemMenu("Total Orders");
      H.popover().findByText("Restore").click();
      H.undoToast().findByText("Total Orders has been restored.");

      // check that it got restored
      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards().findByText("Total Orders");
    });

    it("notifies the user about dashboards and dashcard series that a question will be removed from", () => {
      H.createQuestion(
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

      H.createQuestion(
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

      H.createDashboard(
        {
          name: "Blue Dashboard",
          collection_id: S.FIRST_COLLECTION_ID,
        },
        { wrapId: true, idAlias: "blueDashboardId" },
      );

      H.createDashboard(
        {
          name: "Purple Dashboard",
          collection_id: S.FIRST_COLLECTION_ID,
        },
        { wrapId: true, idAlias: "purpleDashboardId" },
      );

      cy.get("@blueDashboardId").then(blueDashboardId => {
        H.visitDashboard(blueDashboardId);
      });

      // add the quanity question to the blue dashboard
      H.editDashboard();
      H.openQuestionsSidebar();

      H.sidebar().findByText("First collection").click();
      H.sidebar().findByText("Average Quantity by Month Question").click();
      H.saveDashboard();

      cy.get("@purpleDashboardId").then(purpleDashboardId => {
        H.visitDashboard(purpleDashboardId);
      });

      // add the total question to the purple dashboard
      H.editDashboard();
      H.openQuestionsSidebar();

      H.sidebar().findByText("First collection").click();
      H.sidebar().findByText("Average Order Total by Month Question").click();

      // overlay the quantity series in the purple dashboard
      H.showDashboardCardActions(0);
      cy.findByLabelText("Add series").click();

      H.modal().findByLabelText("Average Quantity by Month Question").click();
      H.modal().button("Done").click();
      H.saveDashboard();
      H.dashboardCards()
        .findByText(/Average Quantity by Month/)
        .should("be.visible");

      // move the quantity question to an entirely different dashboard
      H.visitQuestion("@avgQuanityQuestionId");
      H.openQuestionActions("Move");

      H.entityPickerModalTab("Browse").click();
      H.entityPickerModal().findByText("Orders in a dashboard").click();
      H.entityPickerModal().button("Move").click();

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
      H.modal().within(() => {
        cy.findByText(/will be removed from/i);
        cy.findByText(/purple dashboard/i);
        cy.findByText(/blue dashboard/i);
        cy.button("Move it").click();
        cy.findByText("Ryan said no");

        //Continue with the expected behavior
        cy.button("Move it").click();
      });

      cy.get("@purpleDashboardId").then(purpleDashboardId => {
        H.visitDashboard(purpleDashboardId);
      });

      //Wait for dashcard to load
      H.dashboardCards().findByText("Created At: Month").should("exist");

      H.dashboardCards().should(
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

      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.newButton("Question").click();
      H.entityPickerModalTab("Tables").click();
      H.entityPickerModal().findByText("Products").click();
      H.queryBuilderHeader().button("Save").click();

      // should not show dashboard you can't write to
      cy.wait(["@getADashboard"]);

      H.modal()
        .findByText(/Orders in a dashboard/)
        .should("not.exist");

      H.modal().button("Save").click();

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

      H.createQuestion(
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

      H.createDashboard(
        {
          name: "Personal dashboard",
          collection_id: S.ADMIN_PERSONAL_COLLECTION_ID,
        },
        { wrapId: true, idAlias: "personalDashboardId" },
      );

      cy.get("@personalDashboardId").then(personalDashboardId => {
        H.visitDashboard(personalDashboardId);
      });

      H.editDashboard();
      H.openQuestionsSidebar();
      H.sidebar()
        .findByText(/our analyt/i)
        .click();
      H.sidebar().findByText("Total Orders Question").click();
      H.saveDashboard();
      H.dashboardCards().findByText("Total Orders Question");

      cy.signOut();
      cy.signIn("normal");

      cy.get("@totalOrdersQuestionId").then(totalOrdersQuestionId => {
        H.visitQuestion(totalOrdersQuestionId);
      });

      H.openQuestionActions();
      H.popover().findByText("Move").click();
      H.entityPickerModal().findByText("Orders in a dashboard").click();
      H.entityPickerModal().button("Move").click();

      cy.log(
        "We should get a modal saying that we can't move it into a dashboard because it would move it out of a dashboard that we can't access",
      );

      cy.wait("@checkCardsInDashboards");
      H.main()
        .findByText(/Sorry, you don’t have permission to see that./)
        .should("not.exist");
      H.modal()
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
