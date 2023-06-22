import _ from "lodash";
import { restore, visitDashboard } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "31628 Question",
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

const [minSizeX, maxSizeX] = [2, 6];
const [minSizeY, maxSizeY] = [2, 4];

const sizes = _.range(minSizeX, maxSizeX + 1).flatMap(x =>
  _.range(minSizeY, maxSizeY + 1).map(y => ({ x, y })),
);

describe("issue 31628", () => {
  sizes.forEach(size => {
    describe(`card ${size.x}x${size.y}`, () => {
      beforeEach(() => {
        restore();
        cy.signInAsAdmin();

        const cardDetails = {
          size_x: size.x,
          size_y: size.y,
        };

        cy.createQuestionAndDashboard({ cardDetails, questionDetails }).then(
          response => {
            visitDashboard(response.body.dashboard_id);
          },
        );
      });

      it("children should not overflow the card (metabase#31628)", () => {
        cy.findAllByTestId("dashcard").each(dashcard => {
          const dashcardRect = dashcard[0].getBoundingClientRect();
          const descendants = dashcard.find("*");
          const visibleDescendants = descendants.filter(
            (_index, descendant) => {
              const descendantRect = descendant.getBoundingClientRect();
              return descendantRect.width > 0 && descendantRect.height > 0;
            },
          );

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
  });
});
