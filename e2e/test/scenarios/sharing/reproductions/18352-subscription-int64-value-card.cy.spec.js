import {
  restore,
  setupSMTP,
  visitQuestion,
  visitDashboard,
  sendEmailAndAssert,
} from "e2e/support/helpers";
import { USERS } from "e2e/support/cypress_data";

const {
  admin: { first_name, last_name },
} = USERS;

const questionDetails = {
  name: "18352",
  native: {
    query: "SELECT 'foo', 1 UNION ALL SELECT 'bar', 2",
  },
};

describe("issue 18352", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { card_id, dashboard_id } }) => {
        visitQuestion(card_id);

        visitDashboard(dashboard_id);
      },
    );
  });

  it("should send the card with the INT64 values (metabase#18352)", () => {
    cy.icon("subscription").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${first_name} ${last_name}`).click();
    // Click this just to close the popover that is blocking the "Send email now" button
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`To:`).click();

    sendEmailAndAssert(({ html }) => {
      expect(html).not.to.include(
        "An error occurred while displaying this card.",
      );

      expect(html).to.include("foo");
      expect(html).to.include("bar");
    });
  });
});
