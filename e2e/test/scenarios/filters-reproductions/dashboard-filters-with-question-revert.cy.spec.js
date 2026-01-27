const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
        H.restore();
        cy.signInAsAdmin();

        H.createQuestionAndDashboard({
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

          H.visitDashboard(dashboard_id);
          H.editDashboard();
          cy.log("Add the number filter");
          H.setFilter("Number");
          connectFilterToColumn("Field-mapped Rating");
          H.saveDashboard();

          cy.log("Give it a value and make sure that the filer applies");
          H.filterWidget().click();
          H.popover().within(() => {
            cy.findByText("3").click();
            cy.button("Add filter").click();
          });
          assertFilterIsApplied();

          cy.log("Drill down to the question from the dashboard");
          cy.findByTestId("legend-caption-title").click();
          cy.get("@questionId").then((id) => {
            cy.location("pathname").should(
              "eq",
              `/question/${id}-${questionDetails.name}`,
            );
            cy.location("search").should("eq", "?RATING=3");
          });

          cy.log("Revert the question to its original (GUI) version");
          cy.intercept("POST", "/api/revision/revert").as("revertQuestion");
          H.questionInfoButton().click();
          cy.findByRole("tab", { name: "History" }).click();

          cy.findByTestId("saved-question-history-list")
            .find("li")
            .filter(":contains(You created this)")
            .findByTestId("question-revert-button")
            .click();
          cy.wait("@revertQuestion");
          // Mid-test assertions to root out the flakiness
          cy.findByRole("tab", { name: "History" }).click();
          cy.findByTestId("saved-question-history-list").should(
            "contain",
            "You edited this",
          );
          cy.findByTestId("saved-question-history-list")
            .findAllByTestId("question-revert-button")
            .should("have.length", 2);

          cy.findByLabelText("Close").click();

          cy.findByLabelText(`Back to ${dashboardDetails.name}`).click();

          cy.get("@dashboardId").then((id) => {
            cy.location("pathname").should(
              "eq",
              `/dashboard/${id}-${dashboardDetails.name.toLowerCase()}`,
            );
            cy.location("search").should("eq", "?number=3");
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
          H.editDashboard();

          H.filterWidget({ isEditing: true }).click();
          H.getDashboardCard().should("contain", "Unknown Field");

          H.snapshot("35954");
        });
      });

      beforeEach(() => {
        H.restore("35954");
        cy.signInAsAdmin();
      });

      it("should be able to remove the broken connection and connect the filter to the GUI question", function () {
        H.visitDashboard(this.dashboardId);
        H.editDashboard();

        H.filterWidget({ isEditing: true }).click();
        H.getDashboardCard().findByLabelText("Disconnect").click();
        connectFilterToColumn("Rating");
        H.saveDashboard();

        cy.location("search").should("eq", "?number=3");
        assertFilterIsApplied();
      });

      it("filter should automatically be re-connected when the question is reverted back to the SQL version", function () {
        H.visitQuestion(this.questionId);

        H.questionInfoButton().click();
        cy.findByRole("tab", { name: "History" }).click();
        cy.findByTestId("saved-question-history-list")
          .find("li")
          .filter(":contains(You edited this)")
          .findByTestId("question-revert-button")
          .click();

        cy.location("search").should("eq", "?RATING=");
        assertFilterIsDisconnected();

        H.visitDashboard(this.dashboardId);
        cy.location("search").should("eq", "?number=3");
        assertFilterIsApplied();
      });

      it("should work for public dashboards", function () {
        cy.request(
          "POST",
          `/api/dashboard/${this.dashboardId}/public_link`,
        ).then(({ body: { uuid } }) => {
          // Set the filter through the URL
          cy.visit(`/public/dashboard/${uuid}?number=3`);
        });
        assertFilterIsDisconnected();
      });

      it("should work for embedding preview", function () {
        const id = this.dashboardId;

        cy.request("PUT", `/api/dashboard/${id}`, {
          embedding_params: {
            number: "enabled",
          },
          enable_embedding: true,
        });

        // Discard the legalese modal so we don't need to do an extra click in the UI
        H.updateSetting("show-static-embed-terms", false);

        H.visitDashboard(id);
        H.openLegacyStaticEmbeddingModal({
          resource: "dashboard",
          resourceId: id,
        });

        cy.findByTestId("embedding-preview").within(() => {
          cy.intercept("GET", "api/preview_embed/dashboard/**").as(
            "previewEmbed",
          );
          cy.findByRole("tab", { name: "Parameters" }).click();
          cy.findByText("Preview").click();
          // One is for the dashboard, and the other one is for the dashboard card
          cy.wait(["@previewEmbed", "@previewEmbed"]);
        });

        H.getIframeBody().within(() => {
          cy.findByRole("heading", { name: dashboardDetails.name });

          assertFilterIsDisconnected();

          H.filterWidget().click();
          cy.findByPlaceholderText("Enter a number").type("3{enter}");
          cy.button("Add filter").click();

          assertFilterIsDisconnected();
        });
      });

      it("should work for embedding with the editable parameter", function () {
        const id = this.dashboardId;

        cy.request("PUT", `/api/dashboard/${id}`, {
          embedding_params: {
            number: "enabled",
          },
          enable_embedding: true,
        });

        const payload = {
          resource: { dashboard: id },
          params: {},
        };

        H.visitEmbeddedPage(payload);
        assertFilterIsDisconnected();

        H.filterWidget().click();
        cy.findByPlaceholderText("Enter a number").type("3{enter}");
        cy.button("Add filter").click();

        assertFilterIsDisconnected();
      });

      it("should work for embedding with the locked parameter", function () {
        const id = this.dashboardId;

        cy.request("PUT", `/api/dashboard/${id}`, {
          embedding_params: {
            number: "locked",
          },
          enable_embedding: true,
        });

        const payload = {
          resource: { dashboard: id },
          params: { number: [3] },
        };

        H.visitEmbeddedPage(payload);
        assertFilterIsDisconnected();
      });
    },
  );
});

function connectFilterToColumn(column, index = 0) {
  H.getDashboardCard().within(() => {
    cy.findByText("Column to filter on");
    cy.findByText("Select…").click();
  });

  H.popover().within(() => {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByText(column).eq(index).click();
  });
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
