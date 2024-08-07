import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  snapshot,
  editDashboard,
  filterWidget,
  getDashboardCard,
  popover,
  restore,
  saveDashboard,
  setFilter,
  visitDashboard,
  visitEmbeddedPage,
  questionInfoButton,
  modal,
  getIframeBody,
  visitQuestion,
} from "e2e/support/helpers";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("issue 35954", () => {
  const questionDetails = {
    name: "35954",
    query: {
      "source-table": REVIEWS_ID,
      limit: 2,
    },
  };

  const dashboardDetails = {
    name: "35954D",
  };

  const updatedQuestionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native",
      native: {
        "template-tags": {
          RATING: {
            type: "dimension",
            name: "RATING",
            id: "017b9185-c7cc-41ec-ba17-b8b21af879cc",
            "display-name": "Field-mapped Rating",
            default: null,
            dimension: ["field", REVIEWS.RATING, null],
            "widget-type": "number/=",
            options: null,
          },
        },
        query: "SELECT * FROM REVIEWS WHERE {{RATING}} LIMIT 2",
      },
    },
    parameters: [
      {
        id: "017b9185-c7cc-41ec-ba17-b8b21af879cc",
        type: "number/=",
        target: ["dimension", ["template-tag", "RATING"]],
        slug: "RATING",
      },
    ],
    parameter_mappings: [],
  };

  // This potentially reproduces metabase#45022 as well
  context(
    "dashboard filter that loses connection should not crash the UI (metabase#35954)",
    () => {
      before(() => {
        restore();
        cy.signInAsAdmin();

        cy.createQuestionAndDashboard({
          questionDetails,
          cardDetails: {
            size_x: 16,
            size_y: 8,
          },
          dashboardDetails,
        }).then(({ body: { dashboard_id, card_id } }) => {
          cy.wrap(card_id).as("questionId");
          cy.wrap(dashboard_id).as("dashboardId");

          cy.request("PUT", `/api/card/${card_id}`, updatedQuestionDetails);

          visitDashboard(dashboard_id);
          editDashboard();
          cy.log("Add the number filter");
          setFilter("Number");
          connectFilterToColumn("Field-mapped Rating");
          saveDashboard();

          cy.log("Give it a value and make sure that the filer applies");
          filterWidget().click();
          popover().within(() => {
            cy.findByText("3").click();
            cy.button("Add filter").click();
          });
          assertFilterIsApplied();

          cy.log("Drill down to the question from the dashboard");
          cy.findByTestId("legend-caption-title").click();
          cy.get("@questionId").then(id => {
            cy.location("pathname").should(
              "eq",
              `/question/${id}-${questionDetails.name}`,
            );
            cy.location("search").should("eq", "?RATING=3");
          });

          cy.log("Revert the question to its original (GUI) version");
          cy.intercept("POST", "/api/revision/revert").as("revertQuestion");
          questionInfoButton().click();
          cy.findByTestId("saved-question-history-list")
            .find("li")
            .filter(":contains(You created this)")
            .findByTestId("question-revert-button")
            .click();
          cy.wait("@revertQuestion");
          // Mid-test assertions to root out the flakiness
          cy.findByTestId("saved-question-history-list").should(
            "contain",
            "You edited this",
          );
          cy.findByTestId("saved-question-history-list")
            .findAllByTestId("question-revert-button")
            .should("have.length", 2);

          cy.findByLabelText(`Back to ${dashboardDetails.name}`).click();

          cy.get("@dashboardId").then(id => {
            cy.location("pathname").should(
              "eq",
              `/dashboard/${id}-${dashboardDetails.name.toLowerCase()}`,
            );
            cy.location("search").should("eq", "?equal_to=3");
          });

          cy.log("Make sure the disconnected filter doesn't break UI");
          // The filter widget will still have the number 3 applied as the filter,
          // but that shouldn't affect our results since the filter is disconnected.
          assertFilterIsDisconnected();

          // Reloading the dashboard breaks the filter in the original issue
          cy.reload();

          cy.log(
            "Make sure the UI shows the filter is not connected to the GUI card",
          );
          editDashboard();

          cy.findByTestId("fixed-width-filters").icon("gear").click();
          getDashboardCard().should("contain", "Unknown Field");

          snapshot("35954");
        });
      });

      beforeEach(() => {
        restore("35954");
        cy.signInAsAdmin();
      });

      it("should be able to remove the broken connection and connect the filter to the GUI question", function () {
        visitDashboard(this.dashboardId);
        editDashboard();
        openFilterSettings();
        getDashboardCard().findByLabelText("Disconnect").click();
        connectFilterToColumn("Rating");
        saveDashboard();

        cy.location("search").should("eq", "?equal_to=3");
        assertFilterIsApplied();
      });

      it("filter should automatically be re-connected when the question is reverted back to the SQL version", function () {
        visitQuestion(this.questionId);

        questionInfoButton().click();
        cy.findByTestId("saved-question-history-list")
          .find("li")
          .filter(":contains(You edited this)")
          .findByTestId("question-revert-button")
          .click();

        cy.location("search").should("eq", "?RATING=");
        assertFilterIsDisconnected();

        visitDashboard(this.dashboardId);
        cy.location("search").should("eq", "?equal_to=3");
        assertFilterIsApplied();
      });

      it("should work for public dashboards", function () {
        cy.request(
          "POST",
          `/api/dashboard/${this.dashboardId}/public_link`,
        ).then(({ body: { uuid } }) => {
          // Set the filter through the URL
          cy.visit(`/public/dashboard/${uuid}?equal_to=3`);
        });
        assertFilterIsDisconnected();
      });

      it("should work for embedding preview", function () {
        const id = this.dashboardId;

        cy.request("PUT", `/api/dashboard/${id}`, {
          embedding_params: {
            equal_to: "enabled",
          },
          enable_embedding: true,
        });

        // Discard the legalese modal so we don't need to do an extra click in the UI
        cy.request("PUT", "/api/setting/show-static-embed-terms", {
          value: false,
        });

        visitDashboard(id);
        cy.findByTestId("resource-embed-button").click();
        cy.findByTestId("embed-menu-embed-modal-item").click();
        modal().findByText("Static embed").click();

        cy.findByTestId("embedding-preview").within(() => {
          cy.intercept("GET", "api/preview_embed/dashboard/**").as(
            "previewEmbed",
          );
          cy.findByRole("tab", { name: "Parameters" }).click();
          cy.findByText("Preview").click();
          // One is for the dashboard, and the other one is for the dashboard card
          cy.wait(["@previewEmbed", "@previewEmbed"]);
        });

        getIframeBody().within(() => {
          cy.findByRole("heading", { name: dashboardDetails.name });

          assertFilterIsDisconnected();

          filterWidget().click();
          cy.findByPlaceholderText("Enter a number").type("3{enter}");
          cy.button("Add filter").click();

          assertFilterIsDisconnected();
        });
      });

      it("should work for embedding with the editable parameter", function () {
        const id = this.dashboardId;

        cy.request("PUT", `/api/dashboard/${id}`, {
          embedding_params: {
            equal_to: "enabled",
          },
          enable_embedding: true,
        });

        const payload = {
          resource: { dashboard: id },
          params: {},
        };

        visitEmbeddedPage(payload);
        assertFilterIsDisconnected();

        filterWidget().click();
        cy.findByPlaceholderText("Enter a number").type("3{enter}");
        cy.button("Add filter").click();

        assertFilterIsDisconnected();
      });

      it("should work for embedding with the locked parameter", function () {
        const id = this.dashboardId;

        cy.request("PUT", `/api/dashboard/${id}`, {
          embedding_params: {
            equal_to: "locked",
          },
          enable_embedding: true,
        });

        const payload = {
          resource: { dashboard: id },
          params: { equal_to: [3] },
        };

        visitEmbeddedPage(payload);
        assertFilterIsDisconnected();
      });
    },
  );
});

function connectFilterToColumn(column, index = 0) {
  getDashboardCard().within(() => {
    cy.findByText("Column to filter on");
    cy.findByText("Select…").click();
  });

  popover().within(() => {
    cy.findAllByText(column).eq(index).click();
  });
}

function openFilterSettings() {
  cy.findByTestId("fixed-width-filters").icon("gear").click();
}

function assertFilterIsDisconnected() {
  cy.findAllByTestId("cell-data")
    .should("contain", "christ")
    .and("contain", "xavier")
    .and("not.contain", "kale");
}

function assertFilterIsApplied() {
  cy.findAllByTestId("cell-data")
    .should("contain", "kale")
    .and("contain", "pete")
    .and("not.contain", "xavier");
}
