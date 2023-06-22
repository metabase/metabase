import { cypressWaitAll, restore, visitDashboard } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
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
  { size_x: 2, size_y: 2, row: 0, col: 0 },
  { size_x: 2, size_y: 3, row: 2, col: 0 },
  { size_x: 2, size_y: 4, row: 5, col: 0 },
  { size_x: 2, size_y: 5, row: 9, col: 0 },

  { size_x: 3, size_y: 2, row: 0, col: 2 },
  { size_x: 3, size_y: 3, row: 2, col: 2 },
  { size_x: 3, size_y: 4, row: 5, col: 2 },
  { size_x: 3, size_y: 5, row: 9, col: 2 },

  { size_x: 4, size_y: 2, row: 0, col: 5 },
  { size_x: 4, size_y: 3, row: 2, col: 5 },
  { size_x: 4, size_y: 4, row: 5, col: 5 },
  { size_x: 4, size_y: 5, row: 9, col: 5 },

  { size_x: 5, size_y: 2, row: 0, col: 9 },
  { size_x: 5, size_y: 3, row: 2, col: 9 },
  { size_x: 5, size_y: 4, row: 5, col: 9 },
  { size_x: 5, size_y: 5, row: 9, col: 9 },

  { size_x: 6, size_y: 2, row: 0, col: 14 },
  { size_x: 6, size_y: 3, row: 2, col: 14 },
  { size_x: 6, size_y: 4, row: 5, col: 14 },
  { size_x: 6, size_y: 5, row: 9, col: 14 },
];

describe("issue 31628", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createDashboard().then(({ body: dashboard }) => {
      cypressWaitAll(
        cards.map(card => {
          return cy.createQuestionAndAddToDashboard(
            questionDetails,
            dashboard.id,
            card,
          );
        }),
      );

      visitDashboard(dashboard.id);
    });
  });

  it("should render children of smartscalar without overflowing it (metabase#31628)", () => {
    cy.findAllByTestId("dashcard").each(dashcard => {
      const dashcardRect = dashcard[0].getBoundingClientRect();
      const descendants = dashcard.find(
        [
          "[data-testid='scalar-title']",
          "[data-testid='scalar-value']",
          "[data-testid='scalar-previous-value']",
        ].join(","),
      );
      const visibleDescendants = descendants.filter((_index, descendant) => {
        const descendantRect = descendant.getBoundingClientRect();
        return descendantRect.width > 0 && descendantRect.height > 0;
      });

      visibleDescendants.each((_index, descendant) => {
        const descendantRect = descendant.getBoundingClientRect();

        expect(descendantRect.bottom).to.lte(dashcardRect.bottom);
        expect(descendantRect.top).to.gte(dashcardRect.top);
        expect(descendantRect.left).to.gte(dashcardRect.left);
        expect(descendantRect.right).to.lte(dashcardRect.right);
      });
    });
  });
});
