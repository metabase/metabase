import {
  cypressWaitAll,
  openNavigationSidebar,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const SCALAR_QUESTION = {
  name: "31628 Question - This is a rather lengthy question name",
  description: "This is a rather lengthy question description",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const SMART_SCALAR_QUESTION = {
  name: "31628 Question - This is a rather lengthy question name",
  description: "This is a rather lengthy question description",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        {
          "base-type": "type/DateTime",
          "temporal-unit": "month",
        },
      ],
    ],
  },
  display: "smartscalar",
};

const cards = [
  { size_x: 6, size_y: 5, row: 9, col: 0 },
  { size_x: 6, size_y: 4, row: 5, col: 0 },
  { size_x: 6, size_y: 3, row: 2, col: 0 },
  { size_x: 6, size_y: 2, row: 0, col: 0 },

  { size_x: 5, size_y: 5, row: 9, col: 6 },
  { size_x: 5, size_y: 4, row: 5, col: 6 },
  { size_x: 5, size_y: 3, row: 2, col: 6 },
  { size_x: 5, size_y: 2, row: 0, col: 6 },

  { size_x: 4, size_y: 5, row: 9, col: 11 },
  { size_x: 4, size_y: 4, row: 5, col: 11 },
  { size_x: 4, size_y: 3, row: 2, col: 11 },
  { size_x: 4, size_y: 2, row: 0, col: 11 },

  { size_x: 3, size_y: 5, row: 9, col: 15 },
  { size_x: 3, size_y: 4, row: 5, col: 15 },
  { size_x: 3, size_y: 3, row: 2, col: 15 },
  { size_x: 3, size_y: 2, row: 0, col: 15 },

  { size_x: 2, size_y: 5, row: 9, col: 18 },
  { size_x: 2, size_y: 4, row: 5, col: 18 },
  { size_x: 2, size_y: 3, row: 2, col: 18 },
  { size_x: 2, size_y: 2, row: 0, col: 18 },
];

describe("issue 31628", () => {
  describe("display: scalar", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setupDashboardWithQuestionInCards(SCALAR_QUESTION, cards);
    });

    it("should render descendants of a 'scalar' without overflowing it (metabase#31628)", () => {
      const descendantsSelector = [
        "[data-testid='scalar-value']",
        "[data-testid='scalar-title']",
        "[data-testid='scalar-description']",
      ].join(",");

      assertDescendantsNotOverflowDashcards(descendantsSelector);
      openNavigationSidebar();
      assertDescendantsNotOverflowDashcards(descendantsSelector);
    });
  });
  describe("display: smartscalar", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, cards);
    });

    it("should render descendants of a 'smartscalar' without overflowing it (metabase#31628)", () => {
      const descendantsSelector = [
        "[data-testid='scalar-value']",
        "[data-testid='scalar-title']",
        "[data-testid='scalar-description']",
        "[data-testid='scalar-previous-value']",
      ].join(",");

      assertDescendantsNotOverflowDashcards(descendantsSelector);
      openNavigationSidebar();
      assertDescendantsNotOverflowDashcards(descendantsSelector);
    });
  });
});

const setupDashboardWithQuestionInCards = (question, cards) => {
  cy.createDashboard().then(({ body: dashboard }) => {
    cypressWaitAll(
      cards.map(card => {
        return cy.createQuestionAndAddToDashboard(question, dashboard.id, card);
      }),
    );

    visitDashboard(dashboard.id);
  });
};

const assertDescendantsNotOverflowDashcards = selector => {
  cy.findAllByTestId("dashcard").each(dashcard => {
    const descendants = dashcard.find(selector);

    descendants.each((_index, descendant) => {
      assertDescendantNotOverflowsContainer(descendant, dashcard[0]);
    });
  });
};

const assertDescendantNotOverflowsContainer = (descendant, container) => {
  const containerRect = container.getBoundingClientRect();
  const descendantRect = descendant.getBoundingClientRect();

  if (descendantRect.height === 0 || descendantRect.width === 0) {
    return;
  }

  expect(descendantRect.bottom).to.lte(containerRect.bottom);
  expect(descendantRect.top).to.gte(containerRect.top);
  expect(descendantRect.left).to.gte(containerRect.left);
  expect(descendantRect.right).to.lte(containerRect.right);
};
