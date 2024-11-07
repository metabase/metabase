import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import * as S from "e2e/support/cypress_sample_instance_data";
import * as H from "e2e/support/helpers";

describe("Dashboard > Dashboard Questions", () => {
  beforeEach(() => {
    H.restore();
  });

  describe("admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("can save a new question to a dashboard and move it to a collection", () => {
      // visit dash first to set it as recently opened
      cy.visit(`/dashboard/${S.ORDERS_DASHBOARD_ID}`);

      H.newButton("Question").click();
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
      H.createQuestion(
        {
          name: "Total Orders",
          database_id: SAMPLE_DATABASE.id,
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
      H.dashboardCards().findByText("Total Orders");

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
            database_id: SAMPLE_DATABASE.id,
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
          database_id: SAMPLE_DATABASE.id,
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
    });

    it("can edit a dashboard question", () => {
      cy.intercept("PUT", "/api/card/*").as("updateCard");
      H.createQuestion(
        {
          name: "Total Orders",
          dashboard_id: S.ORDERS_DASHBOARD_ID,
          database_id: SAMPLE_DATABASE.id,
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
  });

  describe("limited users", () => {
    beforeEach(() => {
      cy.signIn("readonlynosql");
    });

    it("cannot save dashboard question in a read only dashboard", () => {
      cy.intercept("POST", "/api/card").as("saveQuestion");
      cy.intercept("GET", "/api/dashboard/*").as("getADashboard");

      H.visitDashboard(S.ORDERS_DASHBOARD_ID);
      H.newButton("Question").click();
      H.entityPickerModalTab("Tables").click();
      H.entityPickerModal().findByText("Products").click();
      H.queryBuilderHeader().button("Save").click();

      // should not show dashboard you can't write to
      // why are there 3 requests? 😵‍💫
      cy.wait(["@getADashboard", "@getADashboard", "@getADashboard"]);

      H.modal()
        .findByText(/Orders in a dashboard/)
        .should("not.exist");

      H.modal().button("Save").click();

      cy.wait("@saveQuestion").then(({ response }) => {
        expect(response.statusCode).to.eq(200);
      });
    });
  });
});
