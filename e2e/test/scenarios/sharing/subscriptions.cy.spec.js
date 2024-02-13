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
  setTokenFeatures,
  emailSubscriptionRecipients,
  openEmailPage,
  setupSubscriptionWithRecipient,
  openPulseSubscription,
  sendEmailAndVisitIt,
  clickSend,
  viewEmailPage,
} from "e2e/support/helpers";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { USERS } from "e2e/support/cypress_data";

const { admin, normal } = USERS;

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

    cy.findByLabelText("subscriptions").should("not.exist");
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
    cy.findByLabelText("subscriptions").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Share this dashboard with people *./i);
  });

  describe("sidebar toggling behavior", () => {
    it("should allow toggling the sidebar", () => {
      openDashboardSubscriptions();

      // The sidebar starts open after the method there, so test that clicking the icon closes it
      cy.findByLabelText("subscriptions").click();
      sidebar().should("not.exist");
    });
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
      it("should show existing dashboard subscriptions", () => {
        createEmailSubscription();
        openDashboardSubscriptions();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Emailed hourly");
      });

      it("should forward non-admin users to add email form when clicking add", () => {
        cy.signInAsNormalUser();

        openDashboardSubscriptions();

        sidebar().within(() => {
          cy.findByPlaceholderText("Enter user names or email addresses")
            .click()
            .type(`${normal.first_name} ${normal.last_name}{enter}`);
          cy.contains("Done")
            .closest(".Button")
            .should("not.be.disabled")
            .click();

          cy.findByLabelText("add icon").click();
          cy.findByText("Email this dashboard").should("exist");
        });
      });

      it("should send as BCC by default", () => {
        const ORDERS_DASHBOARD_NAME = "Orders in a dashboard";

        assignRecipients();
        sidebar().within(() => {
          clickSend();
        });

        viewEmailPage(ORDERS_DASHBOARD_NAME);

        cy.get(".main-container").within(() => {
          cy.findByText("Bcc:").should("exist");
          cy.findByText(`${admin.email}`).should("exist");
          cy.findByText(`${normal.email}`).should("exist");
        });
      });

      it("should send as CC when opted-in", () => {
        // opt-in to CC
        cy.visit("/admin/settings/email");
        cy.findByTestId("bcc-enabled?-setting")
          .findByLabelText("CC - Disclose recipients")
          .click();

        const ORDERS_DASHBOARD_NAME = "Orders in a dashboard";

        assignRecipients();
        sidebar().within(() => {
          clickSend();
        });

        viewEmailPage(ORDERS_DASHBOARD_NAME);

        cy.get(".main-container").within(() => {
          cy.findByText("Bcc:").should("not.exist");
          cy.findByText(`${admin.email}`).should("exist");
          cy.findByText(`${normal.email}`).should("exist");
        });
      });
    });

    describe(
      "let non-users unsubscribe from subscriptions",
      { tags: "@flaky" },
      () => {
        it("should allow non-user to unsubscribe from subscription", () => {
          const nonUserEmail = "non-user@example.com";
          const dashboardName = "Orders in a dashboard";

          visitDashboard(ORDERS_DASHBOARD_ID);

          setupSubscriptionWithRecipient(nonUserEmail);

          emailSubscriptionRecipients();

          openEmailPage(dashboardName).then(() => {
            cy.intercept("/api/session/pulse/unsubscribe").as("unsubscribe");
            cy.findByText("Unsubscribe").click();
            cy.wait("@unsubscribe");
            cy.contains(
              `You've unsubscribed ${nonUserEmail} from the "${dashboardName}" alert.`,
            ).should("exist");
          });

          openDashboardSubscriptions();
          openPulseSubscription();

          sidebar().findByText(nonUserEmail).should("not.exist");
        });

        it("should allow non-user to undo-unsubscribe from subscription", () => {
          const nonUserEmail = "non-user@example.com";
          const dashboardName = "Orders in a dashboard";
          visitDashboard(ORDERS_DASHBOARD_ID);

          setupSubscriptionWithRecipient(nonUserEmail);

          emailSubscriptionRecipients();

          openEmailPage(dashboardName).then(() => {
            cy.intercept("/api/session/pulse/unsubscribe").as("unsubscribe");
            cy.intercept("/api/session/pulse/unsubscribe/undo").as(
              "resubscribe",
            );

            cy.findByText("Unsubscribe").click();
            cy.wait("@unsubscribe");

            cy.contains(
              `You've unsubscribed ${nonUserEmail} from the "${dashboardName}" alert.`,
            ).should("exist");

            cy.findByText("Undo").click();
            cy.wait("@resubscribe");

            cy.contains(
              `Okay, ${nonUserEmail} is subscribed to the "${dashboardName}" alert again.`,
            ).should("exist");
          });

          openDashboardSubscriptions();
          openPulseSubscription();

          sidebar().findByText(nonUserEmail).should("exist");
        });

        it("should show 404 page when missing required parameters", () => {
          const nonUserEmail = "non-user@example.com";

          const params = {
            hash: "459a8e9f8d9e",
            email: nonUserEmail,
          }; // missing pulse-id

          cy.visit({
            url: `/unsubscribe`,
            qs: params,
          });

          cy.findByLabelText("error page").should("exist");
        });

        it("should show error message when server responds with an error", () => {
          const nonUserEmail = "non-user@example.com";

          const params = {
            hash: "459a8e9f8d9e",
            email: nonUserEmail,
            "pulse-id": "f", // invalid pulse-id
          };

          cy.visit({
            url: `/unsubscribe`,
            qs: params,
          });

          cy.findByLabelText("error message").should("exist");
        });
      },
    );

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

      visitDashboard(ORDERS_DASHBOARD_ID);
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
    });

    it("should not enable 'Done' button before channel is selected (metabase#14494)", () => {
      openSlackCreationForm();

      cy.findAllByRole("button", { name: "Done" }).should("be.disabled");
      cy.findByPlaceholderText("Pick a user or channel...").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("#work").click();
      cy.findAllByRole("button", { name: "Done" }).should("not.be.disabled");
    });

    it("should have 'Send to Slack now' button (metabase#14515)", () => {
      openSlackCreationForm();

      sidebar().within(() => {
        cy.findAllByRole("button", { name: "Send to Slack now" }).should(
          "be.disabled",
        );
        cy.findByPlaceholderText("Pick a user or channel...").click();
      });

      popover().findByText("#work").click();
      sidebar()
        .findAllByRole("button", { name: "Done" })
        .should("not.be.disabled");
    });

    it("should forward non-admin users to add slack form when clicking add", () => {
      cy.signInAsNormalUser();
      openDashboardSubscriptions();

      sidebar().within(() => {
        cy.findByPlaceholderText("Pick a user or channel...").click();
      });

      popover().findByText("#work").click();
      sidebar().findAllByRole("button", { name: "Done" }).click();

      sidebar().within(() => {
        cy.findByLabelText("add icon").click();
        cy.findByText("Send this dashboard to Slack").should("exist");
      });
    });
  });

  describe("OSS email subscriptions", { tags: ["@OSS", "external"] }, () => {
    beforeEach(() => {
      cy.onlyOn(isOSS);
      cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
      setupSMTP();
    });

    describe("with parameters", () => {
      beforeEach(() => {
        addParametersToDashboard();
      });

      it("should have a list of the default parameters applied to the subscription", () => {
        assignRecipient();

        cy.findByTestId("dashboard-parameters-and-cards")
          .next("aside")
          .as("subscriptionBar")
          .findByText("Text is Corbin Mertz");
        clickButton("Done");

        cy.get("[aria-label='Pulse Card']")
          .findByText("Text is Corbin Mertz")
          .click();

        sendEmailAndVisitIt();
        cy.get("table.header").within(() => {
          cy.findByText("Text").next().findByText("Corbin Mertz");
          cy.findByText("Text 1").should("not.exist");
        });

        // change default text to sallie
        cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
        cy.icon("pencil").click();
        cy.findByTestId("edit-dashboard-parameters-widget-container")
          .findByText("Text")
          .click();
        cy.get("@subscriptionBar").findByText("Corbin Mertz").click();
        popover()
          .findByText("Corbin Mertz")
          .closest("li")
          .icon("close")
          .click();
        popover().find("input").type("Sallie");
        popover().findByText("Sallie Flatley").click();
        popover().contains("Update filter").click();
        cy.button("Save").click();

        // verify existing subscription shows new default in UI
        openDashboardSubscriptions();
        cy.get("[aria-label='Pulse Card']")
          .findByText("Text is Sallie Flatley")
          .click();

        // verify existing subscription show new default in email
        sendEmailAndVisitIt();
        cy.get("table.header").within(() => {
          cy.findByText("Text").next().findByText("Sallie Flatley");
          cy.findByText("Text 1").should("not.exist");
        });
      });
    });
  });

  describeEE("EE email subscriptions", { tags: "@external" }, () => {
    beforeEach(() => {
      setTokenFeatures("all");
      setupSMTP();
      cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    });

    it("should only show current user in recipients dropdown if `user-visiblity` setting is `none`", () => {
      openRecipientsWithUserVisibilitySetting("none");

      popover().find("span").should("have.length", 1);
    });

    it("should only show users in same group in recipients dropdown if `user-visiblity` setting is `group`", () => {
      openRecipientsWithUserVisibilitySetting("group");

      popover().find("span").should("have.length", 5);
    });

    it("should show all users in recipients dropdown if `user-visiblity` setting is `all`", () => {
      openRecipientsWithUserVisibilitySetting("all");

      popover().find("span").should("have.length", 9);
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

        // verify defaults are listed correctly in UI
        cy.get("[aria-label='Pulse Card']")
          .findByText("Text is Corbin Mertz")
          .click();

        // verify defaults are listed correctly in email
        sendEmailAndVisitIt();
        cy.get("table.header").within(() => {
          cy.findByText("Text").next().findByText("Corbin Mertz");
          cy.findByText("Text 1").should("not.exist");
        });

        // change default text to sallie
        cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
        cy.icon("pencil").click();
        cy.findByTestId("edit-dashboard-parameters-widget-container")
          .findByText("Text")
          .click();

        cy.findByTestId("dashboard-parameters-and-cards")
          .next("aside")
          .findByText("Corbin Mertz")
          .click();
        popover()
          .findByText("Corbin Mertz")
          .closest("li")
          .icon("close")
          .click();
        popover().find("input").type("Sallie");
        popover().findByText("Sallie Flatley").click();
        popover().contains("Update filter").click();
        cy.button("Save").click();

        // verify existing subscription shows new default in UI
        openDashboardSubscriptions();
        cy.get("[aria-label='Pulse Card']")
          .findByText("Text is Sallie Flatley")
          .click();

        // verify existing subscription show new default in email
        sendEmailAndVisitIt();
        cy.get("table.header").within(() => {
          cy.findByText("Text").next().findByText("Sallie Flatley");
          cy.findByText("Text 1").should("not.exist");
        });
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

        cy.intercept("PUT", "/api/pulse/*").as("pulsePut");

        clickButton("Done");
        cy.wait("@pulsePut");
        cy.findByTestId("dashboard-parameters-and-cards")
          .next("aside")
          .findByText("Text is 2 selections and 1 more filter")
          .click();

        sendEmailAndVisitIt();
        cy.get("table.header").within(() => {
          cy.findByText("Text")
            .next()
            .findByText("Corbin Mertz and Bobby Kessler");
          cy.findByText("Text 1").next().findByText("Gizmo");
        });
      });
    });
  });
});

// Helper functions
function openDashboardSubscriptions(dashboard_id = ORDERS_DASHBOARD_ID) {
  // Orders in a dashboard
  visitDashboard(dashboard_id);
  cy.findByLabelText("subscriptions").click();
}

function assignRecipient({
  user = admin,
  dashboard_id = ORDERS_DASHBOARD_ID,
} = {}) {
  openDashboardSubscriptions(dashboard_id);
  cy.findByText("Email it").click();
  cy.findByPlaceholderText("Enter user names or email addresses")
    .click()
    .type(`${user.first_name} ${user.last_name}{enter}`)
    .blur(); // blur is needed to close the popover
}

function assignRecipients({
  users = [admin, normal],
  dashboard_id = ORDERS_DASHBOARD_ID,
} = {}) {
  openDashboardSubscriptions(dashboard_id);
  cy.findByText("Email it").click();

  const userInput = users
    .map(user => `${user.first_name} ${user.last_name}{enter}`)
    .join("");

  cy.findByPlaceholderText("Enter user names or email addresses")
    .click()
    .type(userInput)
    .blur(); // blur is needed to close the popover
}

function clickButton(button_name) {
  cy.contains(button_name).closest(".Button").should("not.be.disabled").click();
}

function createEmailSubscription() {
  assignRecipient();
  clickButton("Done");
}

function openSlackCreationForm() {
  openDashboardSubscriptions();
  sidebar().findByText("Send it to Slack").click();
  sidebar().findByText("Send this dashboard to Slack");
}

function openRecipientsWithUserVisibilitySetting(setting) {
  cy.request("PUT", "/api/setting/user-visibility", {
    value: setting,
  });
  cy.signInAsNormalUser();
  openDashboardSubscriptions();

  sidebar()
    .findByPlaceholderText("Enter user names or email addresses")
    .click();
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
