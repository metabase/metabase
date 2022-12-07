import { restore, visitDashboard } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: { "source-table": PRODUCTS_ID },
};

const parameter = {
  name: "Category",
  slug: "category",
  id: "ad1c877e",
  type: "category",
};

const MOBILE_WIDTH = 375; // iPhone SE

describe(`visual tests > dashboard > parameters widget`, () => {
  const parametersShort = new Array(5).fill(parameter);
  const parametersLong = new Array(12).fill(parameter);

  describe(`${parametersShort.length} filters (sticky on mobile)`, () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      cy.createQuestionAndDashboard({
        questionDetails,
      }).then(({ body: card }) => {
        const { dashboard_id } = card;

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: parametersShort,
        });

        const updatedSize = {
          size_x: 12,
          size_y: 32,
        };

        cy.editDashboardCard(card, updatedSize);

        visitDashboard(dashboard_id);

        cy.findByText("test question");
        cy.findByText("Rustic Paper Wallet");
      });
    });

    describe(`desktop`, () => {
      it("is sticky in view mode", () => {
        cy.get("main")
          .scrollTo(0, 264)
          .then(() => {
            cy.createPercySnapshot();
          });

        cy.findByTestId("dashboard-parameters-widget-container").should(
          "have.css",
          "position",
          "fixed",
        );
      });

      it("is sticky in edit mode", () => {
        cy.icon("pencil").click();

        cy.findByTestId("dashboard-parameters-and-cards")
          .scrollTo(0, 464)
          .then(() => {
            cy.createPercySnapshot();
          });

        cy.findByTestId("edit-dashboard-parameters-widget-container").should(
          "not.have.css",
          "position",
          "fixed",
        );
      });
    });

    describe(`mobile`, () => {
      it("is sticky in view mode", () => {
        cy.viewport(MOBILE_WIDTH, 667);

        cy.get("main")
          .scrollTo(0, 264)
          .then(() => {
            cy.createPercySnapshot(null, { widths: [MOBILE_WIDTH] });
          });

        cy.findByTestId("dashboard-parameters-widget-container").should(
          "have.css",
          "position",
          "fixed",
        );
      });

      it("is sticky in edit mode", () => {
        cy.viewport(MOBILE_WIDTH, 667);

        cy.icon("pencil").click();

        cy.findByTestId("dashboard-parameters-and-cards")
          .scrollTo(0, 464)
          .then(() => {
            cy.createPercySnapshot(null, { widths: [MOBILE_WIDTH] });
          });

        cy.findByTestId("edit-dashboard-parameters-widget-container").should(
          "not.have.css",
          "position",
          "fixed",
        );
      });
    });
  });

  describe(`${parametersLong.length} filters (non sticky on mobile)`, () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      cy.createQuestionAndDashboard({
        questionDetails,
      }).then(({ body: card }) => {
        const { dashboard_id } = card;

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: parametersLong,
        });

        const updatedSize = {
          size_x: 12,
          size_y: 32,
        };

        cy.editDashboardCard(card, updatedSize);

        visitDashboard(dashboard_id);
        cy.findByText("test question");
        cy.findByText("Rustic Paper Wallet");
      });
    });

    describe(`desktop`, () => {
      it("is sticky in view mode", () => {
        cy.get("main")
          .scrollTo(0, 264)
          .then(() => {
            cy.createPercySnapshot();
          });

        cy.findByTestId("dashboard-parameters-widget-container").should(
          "have.css",
          "position",
          "fixed",
        );
      });

      it("is sticky in edit mode", () => {
        cy.findByText("test question");

        cy.icon("pencil").click();

        cy.findByTestId("dashboard-parameters-and-cards")
          .scrollTo(0, 464)
          .then(() => {
            cy.createPercySnapshot();
          });

        cy.findByTestId("edit-dashboard-parameters-widget-container").should(
          "not.have.css",
          "position",
          "fixed",
        );
      });
    });

    describe(`mobile`, () => {
      it("is not sticky in view mode", () => {
        cy.viewport(MOBILE_WIDTH, 667);

        cy.get("main")
          .scrollTo(0, 264)
          .then(() => {
            cy.createPercySnapshot(null, { widths: [MOBILE_WIDTH] });
          });

        cy.findByTestId("dashboard-parameters-widget-container").should(
          "not.have.css",
          "position",
          "fixed",
        );
      });

      it("is not sticky in edit mode", () => {
        cy.viewport(MOBILE_WIDTH, 667);

        cy.icon("pencil").click();

        cy.findByTestId("dashboard-parameters-and-cards")
          .scrollTo(0, 464)
          .then(() => {
            cy.createPercySnapshot(null, { widths: [MOBILE_WIDTH] });
          });

        cy.findByTestId("edit-dashboard-parameters-widget-container").should(
          "not.have.css",
          "position",
          "fixed",
        );
      });
    });
  });
});
