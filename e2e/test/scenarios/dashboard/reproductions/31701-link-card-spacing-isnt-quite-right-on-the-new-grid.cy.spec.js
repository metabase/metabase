import {
  editDashboard,
  getDashboardCard,
  popover,
  resizeDashboardCard,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const TEST_DASHBOARD_NAME = "Test Dashboard";
const TEST_QUESTION_NAME = "Super long name".repeat(5);

const linkCardResizeValues = [
  [100, 200],
  [300, 300],
  [500, 500],
];
describe("metabase#31701 - preventing link dashboard card overflows", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/search*").as("search");
  });

  describe("entity links", () => {
    it("should not overflow when editing dashboard", () => {
      createEntityLinkDashboard();
      linkCardResizeValues.forEach(([x, y]) => {
        const dashCard = getDashboardCard(0);

        resizeDashboardCard({
          card: dashCard,
          x,
          y,
        });

        const linkContainer = cy.findByTestId("entity-edit-display-link");

        assertLinkCardOverflow(linkContainer, dashCard);
      });
    });
    it("should not overflow when viewing dashboard", () => {
      createEntityLinkDashboard();
      linkCardResizeValues.forEach(([x, y]) => {
        const editDashCard = getDashboardCard(0);

        resizeDashboardCard({
          card: editDashCard,
          x,
          y,
        });

        saveDashboard();

        const linkContainer = cy.findByTestId("entity-view-display-link");
        const viewDashCard = getDashboardCard(0);

        assertLinkCardOverflow(linkContainer, viewDashCard);

        editDashboard();
      });
    });
  });

  describe("non-entity links", () => {
    it("should not overflow when editing dashboard", () => {
      createCustomLinkDashboard();
      linkCardResizeValues.forEach(([x, y]) => {
        const dashCard = getDashboardCard(0);

        resizeDashboardCard({
          card: dashCard,
          x,
          y,
        });

        const linkContainer = cy.findByTestId("custom-edit-text-link");
        closeLinkSearchDropdown();
        assertLinkCardOverflow(linkContainer, dashCard);
      });
    });
    it("should not overflow when viewing dashboard", () => {
      createCustomLinkDashboard();
      linkCardResizeValues.forEach(([x, y]) => {
        const editDashCard = getDashboardCard(0);

        resizeDashboardCard({
          card: editDashCard,
          x,
          y,
        });

        saveDashboard();

        const linkContainer = cy.findByTestId("custom-view-text-link");
        const viewDashCard = getDashboardCard(0);

        assertLinkCardOverflow(linkContainer, viewDashCard);

        editDashboard();
        closeLinkSearchDropdown();
      });
    });
  });
});

const createEntityLinkDashboard = () => {
  cy.createQuestion({
    name: TEST_QUESTION_NAME,
    query: {
      "source-table": ORDERS_ID,
    },
  });

  cy.createDashboard({
    name: TEST_DASHBOARD_NAME,
  }).then(({ body: { id: dashId } }) => {
    visitDashboard(dashId);
  });

  editDashboard();
  cy.icon("link").click();

  getDashboardCard(0).click().type("Super long name");
  popover().within(() => {
    cy.findAllByTestId("search-result-item-name").first().trigger("click");
  });
};

const createCustomLinkDashboard = () => {
  cy.createDashboard({
    name: TEST_DASHBOARD_NAME,
  }).then(({ body: { id: dashId } }) => {
    visitDashboard(dashId);
  });

  editDashboard();
  cy.icon("link").click();

  getDashboardCard(0).click().type(TEST_QUESTION_NAME);
};

const assertLinkCardOverflow = (card1, card2) => {
  card1.then(linkElem => {
    card2.then(dashCardElem => {
      expect(linkElem[0].scrollHeight).to.eq(dashCardElem[0].scrollHeight);
    });
  });
};

const closeLinkSearchDropdown = () => {
  cy.findByTestId("dashboard-parameters-and-cards").click(0, 0);
};
