import { restore, sidebar, visitDashboard } from "e2e/support/helpers";
import { USERS } from "e2e/support/cypress_data";

const {
  admin: { first_name, last_name },
} = USERS;

describe("issue 17657", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createSubscriptionWithoutRecipients();
  });

  it("frontend should gracefully handle the case of a subscription without a recipient (metabase#17657)", () => {
    visitDashboard(1);

    cy.icon("subscription").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Emailed monthly/).click();

    sidebar().within(() => {
      cy.button("Done").should("be.disabled");
    });

    // Open the popover with all users
    cy.findByPlaceholderText("Enter user names or email addresses").click();
    // Pick admin as a recipient
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${first_name} ${last_name}`).click();

    sidebar().within(() => {
      cy.button("Done").should("not.be.disabled");
    });
  });
});

function createSubscriptionWithoutRecipients() {
  cy.request("POST", "/api/pulse", {
    name: "Orders in a dashboard",
    cards: [
      {
        id: 1,
        collection_id: null,
        description: null,
        display: "table",
        name: "Orders",
        include_csv: false,
        include_xls: false,
        dashboard_card_id: 1,
        dashboard_id: 1,
        parameter_mappings: [],
      },
    ],
    channels: [
      {
        channel_type: "email",
        enabled: true,
        // Since the fix (https://github.com/metabase/metabase/pull/17668), this is not even possible to do in the UI anymore.
        // Backend still doesn't do this validation so we're making sure the FE handles the case of missing recipients gracefully.
        recipients: [],
        details: {},
        schedule_type: "monthly",
        schedule_day: "mon",
        schedule_hour: 8,
        schedule_frame: "first",
      },
    ],
    skip_if_empty: false,
    collection_id: null,
    parameters: [],
    dashboard_id: 1,
  });
}
