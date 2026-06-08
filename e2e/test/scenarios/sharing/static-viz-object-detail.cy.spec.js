const { H } = cy;
import { USERS } from "e2e/support/cypress_data";

const { admin } = USERS;

// Smoke test for object-detail (`display: "object"`) rendering in email subscriptions — pure backend HTML,
// no GraalJS bundle.
describe(
  "scenarios > sharing > static-viz object detail",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setupSMTP();
    });

    it("renders an object detail as a label/value table in a subscription email", () => {
      const questionDetails = {
        name: "Object detail static-viz smoke",
        native: {
          query: "SELECT 'Hammer' AS product, 19 AS price, NULL AS discount",
        },
        display: "object",
      };

      H.createNativeQuestionAndDashboard({ questionDetails }).then(
        ({ dashboardId }) => {
          H.visitDashboard(dashboardId);
        },
      );

      H.openAndAddEmailsToSubscriptions([
        `${admin.first_name} ${admin.last_name}`,
      ]);

      H.sendEmailAndAssert(({ html }) => {
        expect(html).not.to.include(
          "An error occurred while displaying this card.",
        );
        expect(html).to.include("Hammer");
        // "Empty" (the null column) is unique to the :object renderer — a table fallback leaves it blank.
        expect(html).to.include("Empty");
      });
    });
  },
);
