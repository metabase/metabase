import {
  restore,
  setupSMTP,
  visitQuestion,
  visitDashboard,
  clickSend,
} from "__support__/e2e/helpers";
import { USERS } from "__support__/e2e/cypress_data";

const {
  admin: { first_name, last_name },
} = USERS;

const questionDetails = {
  name: "18352",
  native: {
    query: "SELECT 'foo', 1 UNION ALL SELECT 'bar', 2",
  },
};

describe("issue 18352", () => {
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

    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses").click();
    cy.findByText(`${first_name} ${last_name}`).click();
    // Click this just to close the popover that is blocking the "Send email now" button
    cy.findByText(`To:`).click();

    clickSend();

    cy.request("GET", "http://localhost:80/email").then(
      ({ body: [{ html }] }) => {
        expect(html).not.to.include(
          "An error occurred while displaying this card.",
        );

        expect(html).to.include("foo");
        expect(html).to.include("bar");
      },
    );
  });
});
