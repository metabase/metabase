import {
  restore,
  setupSMTP,
  describeEE,
  popover,
  sidebar,
  mockSlackConfigured,
  isOSS,
  visitDashboard,
  clickSend,
} from "__support__/e2e/helpers";
import { USERS } from "__support__/e2e/cypress_data";

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
    cy.findByText("This dashboard is looking empty.");

    cy.icon("share")
      .closest("a")
      .should("have.attr", "aria-disabled", "true")
      .click();

    cy.icon("subscription").should("not.exist");
    cy.findByText(/Share this dashboard with people *./i).should("not.exist");
  });

  it("should allow sharing if dashboard contains only text cards (metabase#15077)", () => {
    cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      visitDashboard(DASHBOARD_ID);
    });
    cy.icon("pencil").click();
    cy.icon("string").click();
    cy.findByPlaceholderText(
      "You can use Markdown here, and include variables {{like_this}}",
    )
      .click()
      .type("Foo");
    cy.button("Save").click();
    cy.findByText("You're editing this dashboard.").should("not.exist");
    cy.icon("share").closest("a").click();

    // Ensure clicking share icon opens sharing and embedding modal directly,
    // without a menu with sharing and dashboard subscription options.
    // Dashboard subscriptions are not shown because
    // getting notifications with static text-only cards doesn't make a lot of sense
    cy.icon("subscription").should("not.exist");
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

  describe("with email set up", () => {
    beforeEach(() => {
      setupSMTP();
    });

    describe("with no existing subscriptions", () => {
      it("should not enable subscriptions without the recipient (metabase#17657)", () => {
        openDashboardSubscriptions();

        cy.findByText("Email it").click();

        // Make sure no recipients have been assigned
        cy.findByPlaceholderText("Enter user names or email addresses");

        // Change the schedule to "Monthly"
        cy.findByText("Hourly").click();
        cy.findByText("Monthly").click();

        sidebar().within(() => {
          cy.button("Done").should("be.disabled");
        });
      });

      it("should allow creation of a new email subscription", () => {
        createEmailSubscription();
        cy.findByText("Emailed hourly");
      });

      it("should not render people dropdown outside of the borders of the screen (metabase#17186)", () => {
        openDashboardSubscriptions();

        cy.findByText("Email it").click();
        cy.findByPlaceholderText("Enter user names or email addresses").click();

        popover().isRenderedWithinViewport();
      });
    });

    describe("with existing subscriptions", () => {
      beforeEach(createEmailSubscription);
      it("should show existing dashboard subscriptions", () => {
        openDashboardSubscriptions();
        cy.findByText("Emailed hourly");
      });
    });

    it("should persist attachments for dashboard subscriptions (metabase#14117)", () => {
      assignRecipient();
      // This is extremely fragile
      // TODO: update test once changes from `https://github.com/metabase/metabase/pull/14121` are merged into `master`
      cy.findByText("Attach results")
        .parent()
        .parent()
        .next()
        .find("input") // Toggle
        .click();
      cy.findByText("Questions to attach").click();
      clickButton("Done");
      cy.findByText("Subscriptions");
      cy.findByText("Emailed hourly").click();
      cy.findByText("Delete this subscription").scrollIntoView();
      cy.findByText("Questions to attach");
      cy.findAllByRole("listitem")
        .contains("Orders") // yields the whole <li> element
        .within(() => {
          cy.findByRole("checkbox").should("be.checked");
        });
    });

    it("should not display 'null' day of the week (metabase#14405)", () => {
      assignRecipient();
      cy.findByText("To:").click();
      cy.findAllByTestId("select-button").contains("Hourly").click();
      cy.findByText("Monthly").click();
      cy.findAllByTestId("select-button").contains("First").click();
      cy.findByText("15th (Midpoint)").click();
      cy.findAllByTestId("select-button").contains("15th (Midpoint)").click();
      cy.findByText("First").click();
      clickButton("Done");
      // Implicit assertion (word mustn't contain string "null")
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
            cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cardId: QUESTION_ID,
            }).then(({ body: { id: DASH_CARD_ID } }) => {
              // Connect filter to that question
              cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
                cards: [
                  {
                    id: DASH_CARD_ID,
                    card_id: QUESTION_ID,
                    row: 0,
                    col: 0,
                    size_x: 12,
                    size_y: 10,
                    parameter_mappings: [
                      {
                        parameter_id: "930e4001",
                        card_id: QUESTION_ID,
                        target: ["variable", ["template-tag", "qty"]],
                      },
                    ],
                  },
                ],
              });
            });
            assignRecipient({ dashboard_id: DASHBOARD_ID });
          },
        );
      });
      // Click anywhere outside to close the popover
      cy.findByText("15705D").click();
      clickSend();
      cy.request("GET", "http://localhost:80/email").then(({ body }) => {
        expect(body[0].html).not.to.include(
          "An error occurred while displaying this card.",
        );
        expect(body[0].html).to.include("2,738");
      });
    });

    it("should include text cards (metabase#15744)", () => {
      const TEXT_CARD = "FooBar";

      visitDashboard(1);
      cy.icon("pencil").click();
      cy.icon("string").click();
      cy.findByPlaceholderText(
        "You can use Markdown here, and include variables {{like_this}}",
      ).type(TEXT_CARD);
      cy.button("Save").click();
      cy.findByText("You're editing this dashboard.").should("not.exist");
      assignRecipient();
      // Click outside popover to close it and at the same time check that the text card content is shown as expected
      cy.findByText(TEXT_CARD).click();
      clickSend();
      cy.request("GET", "http://localhost:80/email").then(({ body }) => {
        expect(body[0].html).to.include(TEXT_CARD);
      });
    });
  });

  describe("with Slack set up", () => {
    beforeEach(() => {
      mockSlackConfigured();
      openDashboardSubscriptions();
      cy.findByText("Send it to Slack").click();
      cy.findByText("Send this dashboard to Slack");
    });

    it("should not enable 'Done' button before channel is selected (metabase#14494)", () => {
      cy.findAllByRole("button", { name: "Done" }).should("be.disabled");
      cy.findByPlaceholderText("Pick a user or channel...").click();
      cy.findByText("#work").click();
      cy.findAllByRole("button", { name: "Done" }).should("not.be.disabled");
    });

    it("should have 'Send to Slack now' button (metabase#14515)", () => {
      cy.findAllByRole("button", { name: "Send to Slack now" }).should(
        "be.disabled",
      );
      cy.findByPlaceholderText("Pick a user or channel...").click();
      cy.findByText("#work").click();
      cy.findAllByRole("button", { name: "Done" }).should("not.be.disabled");
    });
  });

  describe("OSS email subscriptions", { tags: "@OSS" }, () => {
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
        cy.findByText("Text is Corbin Mertz");
        clickButton("Done");

        cy.findByText("Text is Corbin Mertz");
      });
    });
  });

  describeEE("EE email subscriptions", () => {
    beforeEach(() => {
      cy.visit(`/dashboard/1`);
      setupSMTP();
    });

    describe("with no parameters", () => {
      it("should have no parameters section", () => {
        openDashboardSubscriptions();
        cy.findByText("Email it").click();

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

        cy.findByText("Text is Corbin Mertz");
      });

      it("should allow for setting parameters in subscription", () => {
        assignRecipient();
        clickButton("Done");

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
  cy.findByText("Dropdown").click();

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
  cy.findByText("Dropdown").click();
  cy.findByText("Select…").click();
  popover().within(() => {
    cy.findByText("Category").click();
  });

  cy.findByText("Save").click();
  // wait for dashboard to save
  cy.contains("You're editing this dashboard.").should("not.exist");
}
