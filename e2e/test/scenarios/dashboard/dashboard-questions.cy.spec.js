const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import * as S from "e2e/support/cypress_sample_instance_data";
import { createMockDashboardCard } from "metabase-types/api/mocks";

const DASHBOARD_ONE = "Dashboard One";
const DASHBOARD_TWO = "Dashboard Two";

const QUESTION_ONE = "Question One";
const QUESTION_TWO = "Question Two";
const QUESTION_THREE = "Question Three";

describe("Dashboard > Dashboard Questions", () => {
  beforeEach(() => {
    H.restore();
  });

  describe("admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("can save a new question to a dashboard and move it to a collection", () => {
      // visit dash first to set it as recently opened
      cy.visit(`/dashboard/${S.ORDERS_DASHBOARD_ID}`);

      H.newButton("Question").click();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("Orders Model").click();
      });
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

      // should take you to the edit dashboard screen + url has hash param to auto-scroll
      cy.url().should("include", "/dashboard/");
      cy.location("hash").should("match", /scrollTo=\d+/); // url should have hash param to auto-scroll
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
      H.appBar().findByText("Orders in a dashboard").should("not.exist"); // dashboard name should no longer be visible

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

      cy.get("@anotherDashboardId").then((anotherDashboardId) => {
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

      // its in the new dash + url has hash param to auto-scroll
      cy.url().should("include", "/dashboard/");

      cy.location("hash").should("match", /scrollTo=\d+/); // url should have hash param to auto-scroll
      H.undoToast().findByText("Orders in a dashboard");
      H.dashboardCards().should("contain", "Total Orders");

      // and not in the old dash
      H.visitDashboard("@anotherDashboardId");
      cy.findByRole("heading", { name: "This dashboard is empty" }).should(
        "be.visible",
      );
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
        .findByText("This dashboard is empty")
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

      H.queryBuilderHeader()
        .button(/Summarize/)
        .click();
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

      cy.get("@dashboardId").then((dashboardId) => {
        //Simulate having picked the dashboard in the entity picker previously
        cy.request("POST", "/api/activity/recents", {
          context: "selection",
          model: "dashboard",
          model_id: dashboardId,
        });
      });

      cy.visit("/");

      cy.findByLabelText("Navigation bar").findByText("New").click();
      H.popover().findByText("Question").click();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
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
      H.startNewNativeQuestion({ query: "SELECT 123" });

      // this reduces the flakiness
      cy.wait(500);

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
      H.miniPickerBrowseAll().click();
      H.entityPickerModalItem(0, "Our analytics").click();
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
        .closest("a")
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
        .should("not.be.empty")
        .then((publicLink) => {
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

    it("shows trash action for the last dashcard for a dashboard question", () => {
      H.createDashboard({
        name: "Foo Dashboard",
      }).then(({ body: dashboard }) => {
        H.createQuestion({
          name: "Foo dashboard question",
          query: { "source-table": SAMPLE_DATABASE.ORDERS_ID, limit: 5 },
          dashboard_id: dashboard.id,
        }).then(({ body: card }) => {
          H.addOrUpdateDashboardCard({
            card_id: card.id,
            dashboard_id: dashboard.id,
            card: {
              size_x: 6,
              size_y: 6,
            },
          });

          H.visitDashboard(dashboard.id);
        });
      });

      H.editDashboard();

      cy.log(
        "should have trash option as only dashcard for dashboard question",
      );
      H.showDashboardCardActions(0);
      cy.icon("trash").realHover();
      H.tooltip().findByText("Remove and trash").should("exist");

      cy.log(
        "should have remove options if there's more than one dashcard for the dashboard question",
      );
      cy.icon("copy").click();
      cy.findAllByTestId("dashcard").should("have.length", 2);
      H.showDashboardCardActions(0);
      cy.icon("trash").should("not.exist");
      cy.icon("close").should("exist");

      cy.log(
        "should have the trash option if changes leave only one dashcard for a question",
      );
      cy.findAllByTestId("dashcard").eq(1).realHover().icon("close").click();
      cy.findAllByTestId("dashcard").should("have.length", 1);
      H.showDashboardCardActions(0);
      cy.icon("trash").should("exist");

      cy.log("should notify user that removal will also trash the card");
      cy.icon("trash").click();
      cy.findAllByTestId("dashcard").should("have.length", 0);
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
      cy.get("@deletedCardId").then((deletedCardId) => {
        cy.request("PUT", `/api/card/${deletedCardId}`, { archived: true });
      });

      // check that the 2 cards are there
      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.dashboardCards().findByText("Total Orders");
      H.dashboardCards().findByText("Orders");

      // remove the card saved inside the dashboard
      H.editDashboard();
      H.dashboardCards().findByText("Total Orders").realHover();
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.icon("trash").last().click();
      H.undoToast().findByText("Trashed and removed card");
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

      cy.get("@dashboardWithTitleId").then((dashboardId) => {
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
        H.openNavigationSidebar();

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
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

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

      cy.get("@blueDashboardId").then((blueDashboardId) => {
        H.visitDashboard(blueDashboardId);
      });

      // add the quanity question to the blue dashboard
      H.editDashboard();
      H.openQuestionsSidebar();

      H.sidebar().findByText("First collection").click();
      H.sidebar().findByText("Average Quantity by Month Question").click();
      H.saveDashboard();

      cy.get("@purpleDashboardId").then((purpleDashboardId) => {
        H.visitDashboard(purpleDashboardId);
      });

      // add the total question to the purple dashboard
      H.editDashboard();
      H.openQuestionsSidebar();

      H.sidebar().findByText("First collection").click();
      H.sidebar().findByText("Average Order Total by Month Question").click();

      // overlay the quantity series in the purple dashboard
      H.showDashcardVisualizerModal(0, {
        isVisualizerCard: false,
      });

      H.modal().within(() => {
        H.switchToAddMoreData();
        H.selectDataset("Average Quantity by Month Question");
        cy.button("Save").click();
      });

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
      cy.get("@avgQuanityQuestionId").then((questionId) => {
        cy.intercept("PUT", `**/api/card/${questionId}**`, (req) => {
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

      cy.get("@purpleDashboardId").then((purpleDashboardId) => {
        H.visitDashboard(purpleDashboardId);
      });

      //Wait for dashcard to load
      H.dashboardCards().findByText("Created At: Month").should("exist");

      H.dashboardCards().should(
        "not.contain.text",
        "Average Quantity by Month Question",
      );
    });

    it("should be able to save a question to a specific tab", () => {
      cy.intercept("POST", "/api/card").as("saveQuestion");

      const NO_TABS_DASH_NAME = "Orders in a dashboard";
      const TABS_DASH_NAME = "Dashboard with tabs";
      const TAB_ONE_NAME = "First tab";
      const TAB_TWO_NAME = "Second tab";
      const DASHBOARD_QUESTION_NAME = "A tab two kind of question";

      H.createDashboardWithTabs({
        name: TABS_DASH_NAME,
        tabs: [
          { id: -1, name: TAB_ONE_NAME },
          { id: -2, name: TAB_TWO_NAME },
        ],
        dashcards: [],
      });

      H.visitDashboard(S.ORDERS_DASHBOARD_ID);

      H.newButton("SQL query").click();
      H.NativeEditor.type("SELECT 123;");

      H.queryBuilderHeader().button("Save").click();

      cy.findByTestId("save-question-modal").within(() => {
        cy.findByLabelText(/Where do you want to save this/).should(
          "contain.text",
          NO_TABS_DASH_NAME,
        );

        cy.findByLabelText(/Which tab should this go on/).should("not.exist");

        cy.findByLabelText(/Where do you want to save this/).click();
      });

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Browse").click();
        cy.findByText("Dashboard with tabs").click();
        cy.findByText("Select this dashboard").click();
      });

      cy.findByTestId("save-question-modal").within(() => {
        cy.findByLabelText(/Where do you want to save this/).should(
          "contain.text",
          TABS_DASH_NAME,
        );

        cy.findByLabelText(/Which tab should this go on/)
          .should("exist")
          .should("have.value", TAB_ONE_NAME)
          .click();
      });

      H.popover().findByText(TAB_TWO_NAME).click();

      cy.findByTestId("save-question-modal").within(() => {
        cy.findByLabelText(/Which tab should this go on/).should(
          "have.value",
          TAB_TWO_NAME,
        );

        cy.findByLabelText(/Name/).type(DASHBOARD_QUESTION_NAME);

        cy.findByText("Save").click();
      });

      cy.log("should navigate user to the tab the question was saved to");
      cy.url().should("include", "/dashboard/");
      cy.location("hash").should("match", /scrollTo=\d+/); // url should have hash param to auto-scroll
      cy.location("search").should("contain", "tab"); // url should have tab param configured
      H.assertTabSelected(TAB_TWO_NAME);
      H.dashboardCards().within(() => {
        cy.findByText(DASHBOARD_QUESTION_NAME).should("exist");
      });
    });

    it("should allow a user to copy a question into a tab", () => {
      const TAB_ONE_NAME = "First tab";
      H.createDashboardWithTabs({
        name: "Dashboard with tabs",
        tabs: [
          { id: -1, name: TAB_ONE_NAME },
          { id: -2, name: "Second tab" },
        ],
        dashcards: [],
      });

      H.visitQuestion(S.ORDERS_COUNT_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Duplicate").click();

      H.modal().within(() => {
        cy.findByLabelText(/Which tab should this go on/).should("not.exist");
        cy.findByLabelText(/Where do you want to save this/).click();
      });

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Browse").click();
        cy.findByText("Dashboard with tabs").click();
        cy.findByText("Select this dashboard").click();
      });

      H.entityPickerModal().should("not.exist"); // avoid test flaking from two modals being open at once

      H.modal().within(() => {
        cy.findByLabelText(/Which tab should this go on/)
          .should("exist")
          .should("have.value", TAB_ONE_NAME);
        cy.findByText("Duplicate").click();
      });

      cy.log("should navigate user to the tab the question was saved to");
      cy.url().should("include", "/dashboard/");
      cy.location("hash").should("match", /scrollTo=\d+/); // url should have hash param to auto-scroll
      cy.location("search").should("contain", "tab"); // url should have tab param configured
      H.assertTabSelected(TAB_ONE_NAME);
      H.dashboardCards().within(() => {
        cy.findByText("Orders, Count - Duplicate").should("exist");
      });
    });
  });

  describe("limited users", () => {
    it("cannot save dashboard question in a read only dashboard", () => {
      cy.signIn("readonlynosql");

      cy.intercept("POST", "/api/card").as("saveQuestion");
      cy.intercept("GET", "/api/dashboard/*").as("getADashboard");

      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.newButton("Question").click();
      H.miniPicker().findByText("Sample Database").click();
      H.miniPicker().findByText("Products").click();
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

      cy.get("@personalDashboardId").then((personalDashboardId) => {
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

      cy.get("@totalOrdersQuestionId").then((totalOrdersQuestionId) => {
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

  describe("migration modal", () => {
    it("should allow users to migrate questions in one dashboard into their respective dashboards", () => {
      cy.signInAsAdmin();
      cy.log("seed data");
      seedMigrationToolData();

      cy.log("assert questions are in the collection");
      H.visitCollection(S.FIRST_COLLECTION_ID);
      H.collectionTable().within(() => {
        cy.findByText(QUESTION_ONE).should("exist");
        cy.findByText(QUESTION_TWO).should("exist");
        cy.findByText(QUESTION_THREE).should("exist");
      });

      cy.log("user should be able to engage with the tool");
      H.openCollectionMenu();
      H.popover().within(() => {
        cy.findByText("Move questions into their dashboards")
          .should("exist")
          .click();
      });

      cy.log("info modal should appear on first visit");
      cy.findByTestId("move-questions-into-dashboard-info-modal")
        .should("exist")
        .within(() => {
          cy.findByText("Move questions into their dashboards?").should(
            "exist",
          );
          cy.findByText("Preview the changes").should("exist").click();
        });
      cy.log("info modal should disappear");
      cy.findByTestId("move-questions-into-dashboard-info-modal").should(
        "not.exist",
      );

      cy.log("assert migration modal appears");
      cy.findByTestId("move-questions-into-dashboard-modal")
        .should("exist")
        .within(() => {
          cy.log("assert migration tool shows expected data");
          cy.findByText(QUESTION_ONE).should("exist");
          cy.findByText(DASHBOARD_ONE).should("exist");
          cy.findByText(QUESTION_TWO).should("exist");
          cy.findByText(DASHBOARD_TWO).should("exist");
          cy.findByText(QUESTION_THREE).should("not.exist");

          cy.log("migrate the dashboard question candidates");
          cy.findByText("Move these questions").click();
        });
      cy.findByTestId("move-questions-into-dashboard-modal").should(
        "not.exist",
      );
      H.undoToast().should("exist");

      cy.log("assert questions have been migrated out of the collection");
      H.collectionTable().within(() => {
        cy.findByText(QUESTION_ONE).should("not.exist");
        cy.findByText(QUESTION_TWO).should("not.exist");
        cy.findByText(QUESTION_THREE).should("exist");
      });

      cy.log("assert questions have been migrated into their dashboards");
      H.collectionTable().findByText(DASHBOARD_ONE).click();
      H.dashboardCards().within(() => {
        cy.findByText(QUESTION_ONE).should("exist");
        cy.findByText(QUESTION_TWO).should("not.exist");
        cy.findByText(QUESTION_THREE).should("exist");
      });
      cy.go("back");

      H.collectionTable().findByText(DASHBOARD_TWO).click();
      H.dashboardCards().within(() => {
        cy.findByText(QUESTION_ONE).should("not.exist");
        cy.findByText(QUESTION_TWO).should("exist");
        cy.findByText(QUESTION_THREE).should("exist");
      });
      cy.go("back");

      cy.log("assert option to migrate is no longer available");
      H.openCollectionMenu();
      H.popover().within(() => {
        cy.findByText("Move questions into their dashboards").should(
          "not.exist",
        );
      });

      cy.log(
        "should not show the info modal if user has acknowledged it previously",
      );
      H.visitCollection("root");
      H.openCollectionMenu();
      H.popover().within(() => {
        cy.findByText("Move questions into their dashboards")
          .should("exist")
          .click();
      });
      cy.findByTestId("move-questions-into-dashboard-modal")
        .should("exist")
        .within(() => {
          cy.findByText("Cancel").click();
        });

      cy.log(
        "should be immediately responsive to dashcard changes making new candidates",
      );
      H.visitCollection(S.FIRST_COLLECTION_ID);
      H.openCollectionMenu();
      H.popover().within(() => {
        cy.findByText("Move questions into their dashboards").should(
          "not.exist",
        );
      });
      H.collectionTable().findByText(DASHBOARD_ONE).click();
      H.editDashboard();
      H.removeDashboardCard(1); // removes card for QUESTION_THREE
      H.saveDashboard();
      H.appBar().findByText("First collection").click(); // navigate via breadcrumbs to avoid page refresh
      H.openCollectionMenu();
      H.popover().within(() => {
        cy.findByText("Move questions into their dashboards")
          .should("exist")
          .click();
      });
      cy.findByTestId("move-questions-into-dashboard-modal")
        .should("exist")
        .within(() => {
          cy.findByText(QUESTION_THREE).should("exist");
          cy.findByText(DASHBOARD_TWO).should("exist");
        });
    });

    it("should not show migration tool to non-admins", () => {
      cy.signInAsAdmin();
      cy.log("seed data");
      seedMigrationToolData();
      cy.signIn("normal");

      cy.log("assert questions are in the collection");
      H.visitCollection(S.FIRST_COLLECTION_ID);
      H.collectionTable().within(() => {
        cy.findByText(QUESTION_ONE).should("exist");
        cy.findByText(QUESTION_TWO).should("exist");
        cy.findByText(QUESTION_THREE).should("exist");
      });

      cy.log("user should not be able to engage with the tool");
      H.openCollectionMenu();
      H.popover().within(() => {
        cy.findByText("Move questions into their dashboards").should(
          "not.exist",
        );
      });

      cy.log("should get redirect if the user navigates to url directly");
      cy.visit(`/collection/${S.FIRST_COLLECTION_ID}/move-questions-dashboard`);
      cy.url().should("not.include", "move-questions-dashboard");
      cy.url().should("include", `/collection/${S.FIRST_COLLECTION_ID}`);
    });
  });
});

function seedMigrationToolData() {
  const query = { "source-table": SAMPLE_DATABASE.ORDERS_ID };
  const baseDc = { size_x: 8, size_y: 5 };

  H.createQuestion({
    name: QUESTION_THREE,
    query,
    collection_id: S.FIRST_COLLECTION_ID,
  }).then(({ body: { id } }) => {
    const dc = createMockDashboardCard({
      ...baseDc,
      id: 3,
      card_id: id,
      col: 8,
    });
    cy.wrap(dc).as("questionThreeCard");
  });

  H.createQuestionAndDashboard({
    dashboardDetails: {
      name: DASHBOARD_ONE,
      collection_id: S.FIRST_COLLECTION_ID,
    },
    questionDetails: {
      name: QUESTION_ONE,
      query,
      collection_id: S.FIRST_COLLECTION_ID,
    },
  }).then(({ body: { dashboard_id, card_id } }) => {
    cy.get("@questionThreeCard").then((questionThreeCard) => {
      H.updateDashboardCards({
        dashboard_id,
        cards: [
          createMockDashboardCard({ ...baseDc, id: 1, card_id }),
          questionThreeCard,
        ],
      });
    });
  });

  H.createQuestionAndDashboard({
    dashboardDetails: {
      name: DASHBOARD_TWO,
      collection_id: S.FIRST_COLLECTION_ID,
    },
    questionDetails: {
      name: QUESTION_TWO,
      query,
      collection_id: S.FIRST_COLLECTION_ID,
    },
  }).then(({ body: { dashboard_id, card_id } }) => {
    cy.get("@questionThreeCard").then((questionThreeCard) => {
      H.updateDashboardCards({
        dashboard_id,
        cards: [
          createMockDashboardCard({ ...baseDc, id: 2, card_id }),
          questionThreeCard,
        ],
      });
    });
  });
}

function selectCollectionItem(name) {
  cy.findAllByTestId("collection-entry-name")
    .contains(name)
    .parent()
    .parent()
    .findByRole("checkbox")
    .click();
}
