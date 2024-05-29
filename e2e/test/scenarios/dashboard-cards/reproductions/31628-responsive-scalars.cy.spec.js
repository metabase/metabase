import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertDescendantNotOverflowsContainer,
  assertIsEllipsified,
  assertIsNotEllipsified,
  cypressWaitAll,
  openNavigationSidebar,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const createCardsRow = ({ size_y }) => [
  { size_x: 6, size_y, row: 0, col: 0 },
  { size_x: 5, size_y, row: 0, col: 6 },
  { size_x: 4, size_y, row: 0, col: 11 },
  { size_x: 3, size_y, row: 0, col: 15 },
  { size_x: 2, size_y, row: 0, col: 18 },
];

const CARDS_SIZE_1X = {
  cards: [
    ...createCardsRow({ size_y: 1 }),
    { size_x: 1, size_y: 1, row: 0, col: 20 },
    { size_x: 1, size_y: 2, row: 1, col: 20 },
    { size_x: 1, size_y: 4, row: 3, col: 20 },
    { size_x: 1, size_y: 3, row: 7, col: 20 },
  ],
  name: "cards 1 cell high or wide",
};

const VIEWPORTS = [
  { width: 375, height: 667, openSidebar: false },
  { width: 820, height: 800, openSidebar: true },
  { width: 820, height: 800, openSidebar: false },
  { width: 1200, height: 800, openSidebar: true },
  { width: 1440, height: 800, openSidebar: true },
  { width: 1440, height: 800, openSidebar: false },
];

const SCALAR_QUESTION = {
  name: "31628 Question - This is a rather lengthy question name",
  description: "This is a rather lengthy question description",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const SCALAR_QUESTION_CARDS = [
  { cards: createCardsRow({ size_y: 2 }), name: "cards 2 cells high" },
  { cards: createCardsRow({ size_y: 3 }), name: "cards 3 cells high" },
  { cards: createCardsRow({ size_y: 4 }), name: "cards 4 cells high" },
  CARDS_SIZE_1X,
];

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

const SMART_SCALAR_QUESTION_CARDS = [
  { cards: createCardsRow({ size_y: 2 }), name: "cards 2 cells high" },
  { cards: createCardsRow({ size_y: 3 }), name: "cards 3 cells high" },
  { cards: createCardsRow({ size_y: 4 }), name: "cards 4 cells high" },
];

/**
 * This test suite reduces the number of "it" calls for performance reasons.
 * Every block with JSDoc within "it" callbacks should ideally be a separate "it" call.
 * @see https://github.com/metabase/metabase/pull/31722#discussion_r1246165418
 */
describe("issue 31628", () => {
  describe("display: scalar", () => {
    const descendantsSelector = [
      "[data-testid='scalar-container']",
      "[data-testid='scalar-title']",
      "[data-testid='scalar-description']",
    ].join(",");

    VIEWPORTS.forEach(({ width, height, openSidebar }) => {
      SCALAR_QUESTION_CARDS.forEach(({ cards, name }) => {
        const sidebar = openSidebar ? "sidebar open" : "sidebar closed";

        describe(`${width}x${height} - ${sidebar} - ${name}`, () => {
          beforeEach(() => {
            restore();
            cy.viewport(width, height);
            cy.signInAsAdmin();
            setupDashboardWithQuestionInCards(SCALAR_QUESTION, cards);

            if (openSidebar) {
              cy.wait(100);
              openNavigationSidebar();
            }
          });

          it("should render descendants of a 'scalar' without overflowing it (metabase#31628)", () => {
            assertDescendantsNotOverflowDashcards(descendantsSelector);
          });
        });
      });
    });

    describe("1x2 card", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();
        setupDashboardWithQuestionInCards(SCALAR_QUESTION, [
          { size_x: 1, size_y: 2, row: 0, col: 0 },
        ]);
      });

      it("should follow truncation rules", () => {
        /**
         * should truncate value and show value tooltip on hover
         */
        const scalarContainer = cy.findByTestId("scalar-container");

        scalarContainer.then($element => assertIsEllipsified($element[0]));
        scalarContainer.realHover();

        popover().findByText("18,760").should("exist");

        /**
         * should show ellipsis icon with question name in tooltip
         */
        cy.findByTestId("scalar-title-icon").realHover();

        cy.findByRole("tooltip")
          .findByText(SCALAR_QUESTION.name)
          .should("exist");

        /**
         * should not show description
         */
        cy.findByTestId("scalar-description").should("not.exist");
      });
    });

    describe("2x2 card", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();
        setupDashboardWithQuestionInCards(SCALAR_QUESTION, [
          { size_x: 2, size_y: 2, row: 0, col: 0 },
        ]);
      });

      it("should follow truncation rules", () => {
        /**
         * should not truncate value and should not show value tooltip on hover
         */
        const scalarContainer = cy.findByTestId("scalar-container");

        scalarContainer.then($element => assertIsNotEllipsified($element[0]));
        scalarContainer.realHover();

        cy.findByRole("tooltip").should("not.exist");

        /**
         * should not show ellipsis icon for title
         */
        cy.findByTestId("scalar-title-icon").should("not.exist");

        /**
         * should truncate title and show title tooltip on hover
         */
        const scalarTitle = cy.findByTestId("scalar-title");

        scalarTitle.then($element => assertIsEllipsified($element[0]));
        scalarTitle.realHover();

        popover().findByText(SCALAR_QUESTION.name).should("exist");

        /**
         * should show description tooltip on hover
         */
        cy.findByTestId("scalar-description").realHover();

        popover().findByText(SCALAR_QUESTION.description).should("exist");
      });
    });

    describe("5x3 card", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();
        setupDashboardWithQuestionInCards(SCALAR_QUESTION, [
          { size_x: 6, size_y: 3, row: 0, col: 0 },
        ]);
      });

      it("should follow truncation rules", () => {
        /**
         * should not truncate value and should not show value tooltip on hover
         */
        const scalarContainer = cy.findByTestId("scalar-container");

        scalarContainer.then($element => assertIsNotEllipsified($element[0]));
        scalarContainer.realHover();

        cy.findByRole("tooltip").should("not.exist");

        /**
         * should not show ellipsis icon for title
         */
        cy.findByTestId("scalar-title-icon").should("not.exist");

        /**
         * should not truncate title and should not show title tooltip on hover
         */
        const scalarTitle = cy.findByTestId("scalar-title");

        scalarTitle.then($element => assertIsNotEllipsified($element[0]));
        scalarTitle.realHover();

        cy.findByRole("tooltip").should("not.exist");

        /**
         * should show description tooltip on hover
         */
        cy.findByTestId("scalar-description").realHover();

        popover().findByText(SCALAR_QUESTION.description).should("exist");
      });
    });
  });

  describe("display: smartscalar", () => {
    const descendantsSelector = [
      "[data-testid='legend-caption']",
      "[data-testid='scalar-container']",
      "[data-testid='scalar-previous-value']",
    ].join(",");

    VIEWPORTS.forEach(({ width, height, openSidebar }) => {
      SMART_SCALAR_QUESTION_CARDS.forEach(({ cards, name }) => {
        const sidebar = openSidebar ? "sidebar open" : "sidebar closed";

        describe(`${width}x${height} - ${sidebar} - ${name}`, () => {
          beforeEach(() => {
            restore();
            cy.viewport(width, height);
            cy.signInAsAdmin();
            setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, cards);

            if (openSidebar) {
              openNavigationSidebar();
            }
          });

          it("should render descendants of a 'smartscalar' without overflowing it (metabase#31628)", () => {
            assertDescendantsNotOverflowDashcards(descendantsSelector);
          });
        });
      });
    });

    describe("2x2 card", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();
        setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, [
          { size_x: 2, size_y: 2, row: 0, col: 0 },
        ]);
      });

      it("should follow truncation rules", () => {
        /**
         * it should not truncate value and should not show value tooltip on hover
         */
        const scalarContainer = cy.findByTestId("scalar-container");

        scalarContainer.then($element => assertIsNotEllipsified($element[0]));
        scalarContainer.realHover();

        cy.findByRole("tooltip").should("not.exist");

        /**
         * it should not display period because the card height is too small to fit it
         */
        cy.findByTestId("scalar-period").should("not.exist");

        /**
         * it should truncate title and show title tooltip on hover
         */
        const scalarTitle = cy.findByTestId("legend-caption-title");

        scalarTitle.then($element => assertIsEllipsified($element[0]));
        scalarTitle.realHover();

        popover().findByText(SMART_SCALAR_QUESTION.name).should("exist");

        /**
         * it should show previous value tooltip on hover
         */
        cy.findByTestId("scalar-previous-value").realHover();

        popover().within(() => {
          cy.contains("34.72%").should("exist");
          cy.contains("• vs. previous month: 527").should("exist");
        });

        /**
         * it should show previous value as a percentage only (without truncation)
         */
        const previousValue = cy.findByTestId("scalar-previous-value");

        previousValue.within(() => {
          cy.contains("34.7%").should("exist");
          cy.contains("• vs. previous month: 527").should("not.exist");
          previousValue.then($element => assertIsNotEllipsified($element[0]));
        });
      });

      it("should show previous value as a percentage only up to 1 decimal place (without truncation, 1200x600)", () => {
        cy.viewport(1200, 600);

        const previousValue = cy.findByTestId("scalar-previous-value");

        previousValue.within(() => {
          cy.contains("34.7%").should("exist");
          cy.contains("34.72%").should("not.exist");
          cy.contains("• vs. previous month: 527").should("not.exist");
          previousValue.then($element => assertIsNotEllipsified($element[0]));
        });
      });

      it("should show previous value as a percentage without decimal places (without truncation, 1000x600)", () => {
        cy.viewport(1000, 600);

        const previousValue = cy.findByTestId("scalar-previous-value");

        previousValue.within(() => {
          cy.contains("35%").should("exist");
          cy.contains("34.72%").should("not.exist");
          cy.contains("• vs. previous month: 527").should("not.exist");
          previousValue.then($element => assertIsNotEllipsified($element[0]));
        });
      });

      it("should truncate previous value (840x600)", () => {
        cy.viewport(840, 600);

        const previousValue = cy.findByTestId("scalar-previous-value");

        previousValue
          .findByText("35%")
          .then($element => assertIsEllipsified($element[0]));
      });
    });

    describe("7x3 card", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();
        setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, [
          { size_x: 7, size_y: 3, row: 0, col: 0 },
        ]);
      });

      it("should follow truncation rules", () => {
        /**
         * should not truncate value and should not show value tooltip on hover
         */
        let scalarContainer = cy.findByTestId("scalar-container");

        scalarContainer.then($element => assertIsNotEllipsified($element[0]));
        scalarContainer.realHover();

        cy.findByRole("tooltip").should("not.exist");

        /**
         * it should display the period
         */
        cy.findByTestId("scalar-period").should("have.text", "Apr 2026");

        /**
         * should truncate title and show title tooltip on hover
         */
        scalarContainer = cy.findByTestId("legend-caption-title");

        scalarContainer.then($element => assertIsEllipsified($element[0]));
        scalarContainer.realHover();

        popover().findByText(SMART_SCALAR_QUESTION.name).should("exist");

        /**
         * should show description tooltip on hover
         */
        cy.findByTestId("legend-caption").icon("info").realHover();

        popover().findByText(SMART_SCALAR_QUESTION.description).should("exist");

        /**
         * should show previous value in full
         */
        const previousValue = cy.findByTestId("scalar-previous-value");

        previousValue.within(() => {
          cy.contains("34.72%").should("exist");
          cy.contains("• vs. previous month: 527").should("exist");
          previousValue.then($element => assertIsNotEllipsified($element[0]));
        });

        /**
         * should not show previous value tooltip on hover
         */
        cy.findByTestId("scalar-previous-value").realHover();

        cy.findByRole("tooltip").should("not.exist");
      });
    });

    describe("7x4 card", () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();
        setupDashboardWithQuestionInCards(SMART_SCALAR_QUESTION, [
          { size_x: 7, size_y: 4, row: 0, col: 0 },
        ]);
      });

      it("should follow truncation rules", () => {
        /**
         * should not truncate value and should not show value tooltip on hover
         */
        let scalarContainer = cy.findByTestId("scalar-container");

        scalarContainer.then($element => assertIsNotEllipsified($element[0]));
        scalarContainer.realHover();

        cy.findByRole("tooltip").should("not.exist");

        /**
         * it should display the period
         */
        cy.findByTestId("scalar-period").should("have.text", "Apr 2026");

        /**
         * should truncate title and show title tooltip on hover
         */
        scalarContainer = cy.findByTestId("legend-caption-title");

        scalarContainer.then($element => assertIsEllipsified($element[0]));
        scalarContainer.realHover();

        popover().findByText(SMART_SCALAR_QUESTION.name).should("exist");

        /**
         * should show description tooltip on hover
         */
        cy.findByTestId("legend-caption").icon("info").realHover();

        popover().findByText(SMART_SCALAR_QUESTION.description).should("exist");

        /**
         * should show previous value in full
         */
        const previousValue = cy.findByTestId("scalar-previous-value");

        previousValue.within(() => {
          cy.contains("34.72%").should("exist");
          cy.contains("• vs. previous month: 527").should("exist");
          previousValue.then($element => assertIsNotEllipsified($element[0]));
        });

        /**
         * should not show previous value tooltip on hover
         */
        cy.findByTestId("scalar-previous-value").realHover();

        cy.findByRole("tooltip").should("not.exist");
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
  cy.findAllByTestId("dashcard").each((dashcard, dashcardIndex) => {
    const descendants = dashcard.find(descendantsSelector);

    descendants.each((_descendantIndex, descendant) => {
      assertDescendantNotOverflowsContainer(
        descendant,
        dashcard[0],
        `dashcard[${dashcardIndex}] [data-testid="${descendant.dataset.testid}"]`,
      );
    });
  });
};
