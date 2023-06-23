import {
  closeNavigationSidebar,
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

const CARDS = [
  { size_x: 6, size_y: 5, row: 0, col: 0 },
  { size_x: 6, size_y: 4, row: 5, col: 0 },
  { size_x: 6, size_y: 3, row: 9, col: 0 },
  { size_x: 6, size_y: 2, row: 12, col: 0 },

  { size_x: 5, size_y: 5, row: 0, col: 6 },
  { size_x: 5, size_y: 4, row: 5, col: 6 },
  { size_x: 5, size_y: 3, row: 9, col: 6 },
  { size_x: 5, size_y: 2, row: 12, col: 6 },

  { size_x: 4, size_y: 5, row: 0, col: 11 },
  { size_x: 4, size_y: 4, row: 5, col: 11 },
  { size_x: 4, size_y: 3, row: 9, col: 11 },
  { size_x: 4, size_y: 2, row: 12, col: 11 },

  { size_x: 3, size_y: 5, row: 0, col: 15 },
  { size_x: 3, size_y: 4, row: 5, col: 15 },
  { size_x: 3, size_y: 3, row: 9, col: 15 },
  { size_x: 3, size_y: 2, row: 12, col: 15 },

  { size_x: 2, size_y: 5, row: 0, col: 18 },
  { size_x: 2, size_y: 4, row: 5, col: 18 },
  { size_x: 2, size_y: 3, row: 9, col: 18 },
  { size_x: 2, size_y: 2, row: 12, col: 18 },
];

const CARDS_SIZE_1X = [
  { size_x: 1, size_y: 5, row: 0, col: 20 },
  { size_x: 1, size_y: 4, row: 5, col: 20 },
  { size_x: 1, size_y: 3, row: 9, col: 20 },
  { size_x: 1, size_y: 2, row: 12, col: 20 },

  { size_x: 6, size_y: 1, row: 13, col: 0 },
  { size_x: 5, size_y: 1, row: 13, col: 6 },
  { size_x: 4, size_y: 1, row: 13, col: 11 },
  { size_x: 3, size_y: 1, row: 13, col: 15 },
  { size_x: 2, size_y: 1, row: 13, col: 18 },
  { size_x: 1, size_y: 1, row: 13, col: 20 },
];

const VIEWPORTS_SIDEBAR_FLOATING = [[375, 667]];

const VIEWPORTS_SIDEBAR_IN_FLOW = [
  [768, 1200],
  [1024, 1200],
  [1440, 1200],
];

describe("issue 31628", () => {
  describe("display: scalar", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setupDashboardWithQuestionInCards(SCALAR_QUESTION, [
        ...CARDS,
        ...CARDS_SIZE_1X,
      ]);
    });

    it("should render descendants of a 'scalar' without overflowing it (metabase#31628)", () => {
      const descendantsSelector = [
        "[data-testid='scalar-value']",
        "[data-testid='scalar-title']",
        "[data-testid='scalar-description']",
      ].join(",");

      VIEWPORTS_SIDEBAR_FLOATING.forEach(([width, height]) => {
        cy.viewport(width, height);
        assertDescendantsNotOverflowDashcards(descendantsSelector);
      });

      VIEWPORTS_SIDEBAR_IN_FLOW.forEach(([width, height]) => {
        cy.viewport(width, height);
        assertDescendantsNotOverflowDashcards(descendantsSelector);
        openNavigationSidebar();
        assertDescendantsNotOverflowDashcards(descendantsSelector);
        closeNavigationSidebar();
      });
    });
  });
  describe("display: smartscalar", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, CARDS);
    });

    it("should render descendants of a 'smartscalar' without overflowing it (metabase#31628)", () => {
      const descendantsSelector = [
        "[data-testid='scalar-value']",
        "[data-testid='scalar-title']",
        "[data-testid='scalar-description']",
        "[data-testid='scalar-previous-value']",
      ].join(",");

      VIEWPORTS_SIDEBAR_FLOATING.forEach(([width, height]) => {
        cy.viewport(width, height);
        assertDescendantsNotOverflowDashcards(descendantsSelector);
      });

      VIEWPORTS_SIDEBAR_IN_FLOW.forEach(([width, height]) => {
        cy.viewport(width, height);
        assertDescendantsNotOverflowDashcards(descendantsSelector);
        openNavigationSidebar();
        assertDescendantsNotOverflowDashcards(descendantsSelector);
        closeNavigationSidebar();
      });
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

const assertDescendantsNotOverflowDashcards = descendantsSelector => {
  cy.findAllByTestId("dashcard").each(dashcard => {
    const descendants = dashcard.find(descendantsSelector);

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
