import {
  createLinkCard,
  editDashboard,
  getDashboardCard,
  popover,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const TEST_DASHBOARD_NAME = "Test Dashboard";
const TEST_QUESTION_NAME = "Test Question";

const viewports = [
  [768, 800],
  [1024, 800],
  [1440, 800],
];
describe("metabase#31701 - preventing link dashboard card overflows", () => {
  viewports.forEach(([width, height]) => {
    describe(`Testing on resolution ${width} x ${height}`, () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();
        cy.intercept("GET", "/api/search*").as("search");
        cy.viewport(width, height);
        console.count("BEFORE EACH");
      });

      it("should not allow links to overflow when editing dashboard", () => {
        createLinkDashboard();
        const { entityCard, customCard } = getLinkCards();

        const editLinkContainer = cy.findByTestId("entity-edit-display-link");
        const linkContainer = cy.findByTestId("custom-edit-text-link");

        assertLinkCardOverflow(editLinkContainer, entityCard);
        assertLinkCardOverflow(linkContainer, customCard);
      });

      it("should not allow links to overflow when viewing saved dashboard", () => {
        createLinkDashboard();
        saveDashboard();
        const { entityCard, customCard } = getLinkCards();

        const editLinkContainer = cy.findByTestId("entity-view-display-link");
        const linkContainer = cy.findByTestId("custom-view-text-link");

        assertLinkCardOverflow(editLinkContainer, entityCard);
        assertLinkCardOverflow(linkContainer, customCard);
      });
    });
  });
});

const createLinkDashboard = () => {
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
  createLinkCard();
  createLinkCard();

  const { entityCard, customCard } = getLinkCards();

  entityCard.click().type(TEST_QUESTION_NAME);
  popover().within(() => {
    cy.findAllByTestId("search-result-item-name").first().trigger("click");
  });
  customCard.click().type(TEST_QUESTION_NAME);

  closeLinkSearchDropdown();
};

const getLinkCards = () => {
  return {
    entityCard: getDashboardCard(0),
    customCard: getDashboardCard(1),
  };
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
