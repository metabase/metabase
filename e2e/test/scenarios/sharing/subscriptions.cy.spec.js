import {
  restore,
  setupSMTP,
  describeEE,
  popover,
  sidebar,
  mockSlackConfigured,
  isOSS,
  visitDashboard,
  sendEmailAndAssert,
  addOrUpdateDashboardCard,
  addTextBox,
} from "e2e/support/helpers";
import { USERS } from "e2e/support/cypress_data";

const { admin } = USERS;

describe("scenarios > dashboard > subscriptions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it.skip("should not allow sharing if there are no dashboard cards", () => {
    cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      visitDashboard(DASHBOARD_ID);
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is looking empty.");

    cy.icon("share")
      .closest("a")
      .should("have.attr", "aria-disabled", "true")
      .click();

    cy.icon("subscription").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Share this dashboard with people *./i).should("not.exist");
  });

  it("should allow sharing if dashboard contains only text cards (metabase#15077)", () => {
    cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      visitDashboard(DASHBOARD_ID);
    });
    addTextBox("Foo");
    cy.button("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("You're editing this dashboard.").should("not.exist");
    cy.icon("share").closest("a").click();

    // Ensure clicking share icon opens sharing and embedding modal directly,
    // without a menu with sharing and dashboard subscription options.
    // Dashboard subscriptions are not shown because
    // getting notifications with static text-only cards doesn't make a lot of sense
    cy.icon("subscription").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Share this dashboard with people *./i);
  });

  describe("with no channels set up", () => {
    it("should instruct user to connect email or slack", () => {
      openDashboardSubscriptions();
      // Look for the messaging about configuring slack and email
      cy.findByRole("link", { name: /set up email/i });
      cy.findByRole("link", { name: /configure Slack/i });
    });
  });

  describe("with email set up", { tags: "@external" }, () => {
    beforeEach(() => {
      setupSMTP();
    });

    describe("with no existing subscriptions", () => {
      it("should not enable subscriptions without the recipient (metabase#17657)", () => {
        openDashboardSubscriptions();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Email it").click();

        // Make sure no recipients have been assigned
        cy.findByPlaceholderText("Enter user names or email addresses");

        // Change the schedule to "Monthly"
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Hourly").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Monthly").click();

        sidebar().within(() => {
          cy.button("Done").should("be.disabled");
        });
      });

      it("should allow creation of a new email subscription", () => {
        createEmailSubscription();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Emailed hourly");
      });

      it("should not render people dropdown outside of the borders of the screen (metabase#17186)", () => {
        openDashboardSubscriptions();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Email it").click();
        cy.findByPlaceholderText("Enter user names or email addresses").click();

        popover().isRenderedWithinViewport();
      });

      it.skip("should not send attachments by default if not explicitly selected (metabase#28673)", () => {
        openDashboardSubscriptions();
        assignRecipient();

        cy.findByLabelText("Attach results").should("not.be.checked");
        sendEmailAndAssert(
          ({ attachments }) => expect(attachments).to.be.empty,
        );
      });
    });

    describe("with existing subscriptions", () => {
      beforeEach(createEmailSubscription);
      it("should show existing dashboard subscriptions", () => {
        openDashboardSubscriptions();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Emailed hourly");
      });
    });

    it("should persist attachments for dashboard subscriptions (metabase#14117)", () => {
      assignRecipient();
      // This is extremely fragile
      // TODO: update test once changes from `https://github.com/metabase/metabase/pull/14121` are merged into `master`
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Attach results")
        .parent()
        .parent()
        .next()
        .find("input") // Toggle
        .click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Questions to attach").click();
      clickButton("Done");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Subscriptions");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Emailed hourly").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Delete this subscription").scrollIntoView();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Questions to attach");
      cy.findAllByRole("listitem")
        .contains("Orders") // yields the whole <li> element
        .within(() => {
          cy.findByRole("checkbox").should("be.checked");
        });
    });

    it("should not display 'null' day of the week (metabase#14405)", () => {
      assignRecipient();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("To:").click();
      cy.findAllByTestId("select-button").contains("Hourly").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Monthly").click();
      cy.findAllByTestId("select-button").contains("First").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("15th (Midpoint)").click();
      cy.findAllByTestId("select-button").contains("15th (Midpoint)").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("First").click();
      clickButton("Done");
      // Implicit assertion (word mustn't contain string "null")
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Emailed monthly on the first (?!null)/);
    });

    it("should work when using dashboard default filter value on native query with required parameter (metabase#15705)", () => {
      cy.createNativeQuestion({
        name: "15705",
        native: {
          query: "SELECT COUNT(*) FROM ORDERS WHERE QUANTITY={{qty}}",
          "template-tags": {
            qty: {
              id: "3cfb3686-0d13-48db-ab5b-100481a3a830",
              name: "qty",
              "display-name": "Qty",
              type: "number",
              required: true,
            },
          },
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.createDashboard({ name: "15705D" }).then(
          ({ body: { id: DASHBOARD_ID } }) => {
            // Add filter to the dashboard
            cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
              // Using the old dashboard filter syntax
              parameters: [
                {
                  name: "Quantity",
                  slug: "quantity",
                  id: "930e4001",
                  type: "category",
                  default: "3",
                },
              ],
            });

            // Add question to the dashboard
            addOrUpdateDashboardCard({
              dashboard_id: DASHBOARD_ID,
              card_id: QUESTION_ID,
              card: {
                parameter_mappings: [
                  {
                    parameter_id: "930e4001",
                    card_id: QUESTION_ID,
                    target: ["variable", ["template-tag", "qty"]],
                  },
                ],
              },
            });

            assignRecipient({ dashboard_id: DASHBOARD_ID });
          },
        );
      });
      // Click anywhere outside to close the popover
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("15705D").click();
      sendEmailAndAssert(email => {
        expect(email.html).not.to.include(
          "An error occurred while displaying this card.",
        );
        expect(email.html).to.include("2,738");
      });
    });

    it("should include text cards (metabase#15744)", () => {
      const TEXT_CARD = "FooBar";

      visitDashboard(1);
      addTextBox(TEXT_CARD);
      cy.button("Save").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("You're editing this dashboard.").should("not.exist");
      assignRecipient();
      // Click outside popover to close it and at the same time check that the text card content is shown as expected
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(TEXT_CARD).click();
      sendEmailAndAssert(email => {
        expect(email.html).to.include(TEXT_CARD);
      });
    });
  });

  describe("with Slack set up", () => {
    beforeEach(() => {
      mockSlackConfigured();
      openDashboardSubscriptions();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Send it to Slack").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Send this dashboard to Slack");
    });

    it("should not enable 'Done' button before channel is selected (metabase#14494)", () => {
      cy.findAllByRole("button", { name: "Done" }).should("be.disabled");
      cy.findByPlaceholderText("Pick a user or channel...").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("#work").click();
      cy.findAllByRole("button", { name: "Done" }).should("not.be.disabled");
    });

    it("should have 'Send to Slack now' button (metabase#14515)", () => {
      cy.findAllByRole("button", { name: "Send to Slack now" }).should(
        "be.disabled",
      );
      cy.findByPlaceholderText("Pick a user or channel...").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("#work").click();
      cy.findAllByRole("button", { name: "Done" }).should("not.be.disabled");
    });
  });

  describe("OSS email subscriptions", { tags: ["@OSS", "external"] }, () => {
    beforeEach(() => {
      cy.onlyOn(isOSS);
      cy.visit(`/dashboard/1`);
      setupSMTP();
    });

    describe("with parameters", () => {
      beforeEach(() => {
        addParametersToDashboard();
      });

      it("should have a list of the default parameters applied to the subscription", () => {
        assignRecipient();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Text is Corbin Mertz");
        clickButton("Done");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Text is Corbin Mertz");
      });
    });
  });

  describeEE("EE email subscriptions", { tags: "@external" }, () => {
    beforeEach(() => {
      cy.visit(`/dashboard/1`);
      setupSMTP();
    });

    describe("with no parameters", () => {
      it("should have no parameters section", () => {
        openDashboardSubscriptions();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Email it").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Set filter values for when this gets sent").should(
          "not.exist",
        );
      });
    });

    describe("with parameters", () => {
      beforeEach(() => {
        addParametersToDashboard();
      });

      it("should show a filter description containing default values, even when not explicitly added to subscription", () => {
        assignRecipient();
        clickButton("Done");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Text is Corbin Mertz");
      });

      it("should allow for setting parameters in subscription", () => {
        assignRecipient();
        clickButton("Done");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Emailed hourly").click();

        cy.findAllByText("Corbin Mertz").last().click();
        popover().find("input").type("Bob");
        popover().findByText("Bobby Kessler").click();
        popover().contains("Update filter").click();

        cy.findAllByText("Text 1").last().click();
        popover().findByText("Gizmo").click();
        popover().contains("Add filter").click();

        cy.intercept("PUT", "/api/pulse/1").as("pulsePut");

        clickButton("Done");
        cy.wait("@pulsePut");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Text is 2 selections and 1 more filter");
      });
    });
  });
});

// Helper functions
function openDashboardSubscriptions(dashboard_id = 1) {
  // Orders in a dashboard
  visitDashboard(dashboard_id);
  cy.icon("subscription").click();
}

function assignRecipient({ user = admin, dashboard_id = 1 } = {}) {
  openDashboardSubscriptions(dashboard_id);
  cy.findByText("Email it").click();
  cy.findByPlaceholderText("Enter user names or email addresses")
    .click()
    .type(`${user.first_name} ${user.last_name}{enter}`)
    .blur(); // blur is needed to close the popover
}

function clickButton(button_name) {
  cy.contains(button_name).closest(".Button").should("not.be.disabled").click();
}

function createEmailSubscription() {
  assignRecipient();
  clickButton("Done");
}

function addParametersToDashboard() {
  // edit dashboard
  cy.icon("pencil").click();

  // add Category > Dropdown "Name" filter
  cy.icon("filter").click();
  cy.findByText("Text or Category").click();
  cy.findByText("Is").click();

  cy.findByText("Select…").click();
  popover().within(() => {
    cy.findByText("Name").click();
  });

  // add default value to the above filter
  cy.findByText("No default").click();
  popover().find("input").type("Corbin");
  popover().findByText("Corbin Mertz").click();
  popover().contains("Add filter").click();

  // add Category > Dropdown "Category" filter
  cy.icon("filter").click();
  cy.findByText("Text or Category").click();
  cy.findByText("Is").click();
  cy.findByText("Select…").click();
  popover().within(() => {
    cy.findByText("Category").click();
  });

  cy.findByText("Save").click();
  // wait for dashboard to save
  cy.contains("You're editing this dashboard.").should("not.exist");
}
