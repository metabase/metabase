import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createActionCard,
  createHeadingCard,
  createLinkCard,
  createTextCard,
  editDashboard,
  getDashboardCard,
  modal,
  popover,
  restore,
  updateDashboardCards,
  visitDashboard,
} from "e2e/support/helpers";

const URL = "https://example.com/";
const FILTER_NAME = "testFilter";
const FILTER_VALUE = "abc123";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const LINE_CHART = {
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("dashcards without click behavior", () => {
    it("does not allow to set click behavior for virtual dashcards", () => {
      cy.createDashboard().then(({ body: dashboard }) => {
        const textCard = createTextCard({ size_y: 1 });
        const headingCard = createHeadingCard();
        const actionCard = createActionCard();
        const linkCard = createLinkCard();
        const cards = [textCard, headingCard, actionCard, linkCard];
        updateDashboardCards({ dashboard_id: dashboard.id, cards });

        visitDashboard(dashboard.id);
        editDashboard();

        cards.forEach((card, index) => {
          const display = card.visualization_settings.virtual_card.display;
          cy.log(`does not allow to set click behavior for "${display}" card`);

          getDashboardCard(index).realHover().icon("click").should("not.exist");
        });
      });
    });

    it("does not allow to set click behavior for object detail dashcard", () => {
      cy.createQuestionAndDashboard({
        questionDetails: {
          display: "object",
          query: { "source-table": SAMPLE_DATABASE.ORDERS_ID },
        },
      }).then(({ body: dashboard }) => {
        visitDashboard(dashboard.id);
        editDashboard();

        getDashboardCard().realHover().icon("click").should("not.exist");
      });
    });
  });

  describe("line chart", () => {
    const questionDetails = LINE_CHART;

    it("allows setting URL as custom destination", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: dashboard }) => {
          visitDashboard(dashboard.id);
          editDashboard();
          getDashboardCard().realHover().icon("click").click();

          cy.log("does not allow to update dashboard filter if there are none");
          getSidebar()
            .findByText("Update a dashboard filter")
            .invoke("css", "pointer-events")
            .should("equal", "none");

          getSidebar().findByText("Go to a custom destination").click();
          getSidebar().findByText("URL").click();

          modal().within(() => {
            cy.findByRole("textbox").type(URL);
            cy.button("Done").click();
          });

          getSidebar().button("Done").click();
          cy.findByTestId("edit-bar").button("Save").click();
          cy.findByTestId("edit-bar").should("not.exist");

          expectNextAnchorClick({
            href: URL,
            rel: "noopener",
            target: "_blank",
          });
          cy.findByTestId("dashcard").get("circle.dot").eq(48).click();

          editDashboard();

          cy.icon("filter").click();
          popover().within(() => {
            cy.findByText("Text or Category").click();
            cy.findByText("Is").click();
          });
          cy.findByTestId("parameter-sidebar")
            .findByLabelText("Label")
            .clear()
            .type(FILTER_NAME);
          cy.findByTestId("parameter-sidebar").button("Done").click();

          getDashboardCard().realHover().icon("click").click();
          getSidebar().findByText(URL).click();

          modal().within(() => {
            cy.findByRole("textbox").type(`{{}{{}${FILTER_NAME}}}`);
            cy.button("Done").click();
          });

          getSidebar().button("Done").click();

          cy.findByTestId("edit-bar").button("Save").click();
          cy.findByTestId("edit-bar").should("not.exist");

          cy.findByTestId("field-set").click();
          popover().within(() => {
            cy.findByPlaceholderText("Enter some text").type(FILTER_VALUE);
            cy.button("Add filter").click();
          });

          expectNextAnchorClick({
            href: `${URL}${FILTER_VALUE}`,
            rel: "noopener",
            target: "_blank",
          });
          cy.findByTestId("dashcard").get("circle.dot").eq(48).click();
        },
      );
    });
  });
});

const getSidebar = () => cy.findByTestId("click-behavior-sidebar");

/**
 * This function exists to work around custom dynamic anchor creation
 * @see https://github.com/metabase/metabase/blob/master/frontend/src/metabase/lib/dom.js#L301-L310
 */
const expectNextAnchorClick = ({ href, rel, target }) => {
  cy.window().then(window => {
    const originalClick = window.HTMLAnchorElement.prototype.click;

    window.HTMLAnchorElement.prototype.click = function () {
      if (href) {
        expect(this).to.have.property("href", href);
      } else {
        expect(this).not.to.have.property("href");
      }

      if (rel) {
        expect(this).to.have.property("rel", rel);
      } else {
        expect(this).not.to.have.property("rel");
      }

      if (target) {
        expect(this).to.have.property("target", target);
      } else {
        expect(this).not.to.have.property("target");
      }

      window.HTMLAnchorElement.prototype.click = originalClick;
    };
  });
};
