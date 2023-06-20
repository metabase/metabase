import {
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
const TEST_QUESTION_NAME = "Super long name".repeat(2);

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

      it("should not allow entity links to overflow", () => {
        createEntityLinkDashboard();

        const editDashCard = getDashboardCard(0);
        const editLinkContainer = cy.findByTestId("entity-edit-display-link");

        assertLinkCardOverflow(editLinkContainer, editDashCard);

        saveDashboard();
        const viewDashCard = getDashboardCard(0);
        const linkContainer = cy.findByTestId("entity-view-display-link");

        assertLinkCardOverflow(linkContainer, viewDashCard);
      });

      it("should not allow non-entity links to overflow", () => {
        createCustomLinkDashboard();

        const editDashCard = getDashboardCard(0);
        const editLinkContainer = cy.findByTestId("custom-edit-text-link");

        closeLinkSearchDropdown();

        assertLinkCardOverflow(editDashCard, editLinkContainer);

        saveDashboard();

        const viewDashCard = getDashboardCard(0);
        const viewLinkContainer = cy.findByTestId("custom-view-text-link");

        assertLinkCardOverflow(viewLinkContainer, viewDashCard);
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
