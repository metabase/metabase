const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { embedModalEnableEmbedding } from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;
const { admin, normal } = USERS;

describe("scenarios > dashboard > subscriptions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow sharing if there are no dashboard cards", () => {
    H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      H.visitDashboard(DASHBOARD_ID);
    });

    cy.findByLabelText("subscriptions").should("not.exist");

    H.openSharingMenu(/public link/i);
    cy.findByTestId("public-link-popover-content").should("be.visible");

    H.openSharingMenu("Embed");
    H.embedModalContent().should("be.visible");
  });

  it("should allow sharing if dashboard contains only text cards (metabase#15077)", () => {
    H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      H.visitDashboard(DASHBOARD_ID);
    });
    H.addTextBox("Foo");
    cy.button("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("You're editing this dashboard.").should("not.exist");
    H.openSharingMenu();
    // Dashboard subscriptions are not shown because
    // getting notifications with static text-only cards doesn't make a lot of sense
    H.sharingMenu().findByText("subscriptions").should("not.exist");

    H.sharingMenu().within(() => {
      cy.findByText("Create a public link").should("be.visible");
      cy.findByText("Embed").should("be.visible");
    });
  });

  describe("sidebar toggling behavior", () => {
    it("should allow toggling the sidebar", () => {
      openDashboardSubscriptions();

      // The sidebar starts open after the method there, so test that clicking the icon closes it
      H.openSharingMenu("Subscriptions");
      H.sidebar().should("not.exist");
    });
  });

  describe("with no channels set up", () => {
    it("should instruct user to connect email or slack", () => {
      openDashboardSubscriptions();
      // Look for the messaging about configuring slack and email
      cy.findByRole("link", { name: /set up email/i }).should(
        "have.attr",
        "href",
        "/admin/settings/email",
      );
      cy.findByRole("link", { name: /configure Slack/i }).should(
        "have.attr",
        "href",
        "/admin/settings/notifications",
      );
    });
  });

  describe("with email set up", { tags: "@external" }, () => {
    beforeEach(() => {
      H.setupSMTP();
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

        H.sidebar().within(() => {
          cy.button("Done").should("be.disabled");
        });
      });

      it("should allow creation of a new email subscription", () => {
        createEmailSubscription();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Emailed hourly");
      });

      it("should not add a recipient when Escape is pressed (metabase#24629)", () => {
        openDashboardSubscriptions(ORDERS_DASHBOARD_ID);

        H.sidebar().findByText("Email it").click();

        cy.findByPlaceholderText("Enter user names or email addresses").click();
        H.popover().should("be.visible").and("contain", `${admin.first_name}`);
        cy.realPress("Escape");
        H.popover({ skipVisibilityCheck: true }).should("not.exist");
        cy.findByPlaceholderText("Enter user names or email addresses").should(
          "not.have.value",
        );

        cy.findByTestId("token-field-popover").should("not.exist");
      });

      it("should not render people dropdown outside of the borders of the screen (metabase#17186)", () => {
        openDashboardSubscriptions();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Email it").click();
        cy.findByPlaceholderText("Enter user names or email addresses").click();

        H.popover().isRenderedWithinViewport();
      });

      it(
        "should not send attachments by default if not explicitly selected (metabase#28673)",
        { tags: "@skip" },
        () => {
          openDashboardSubscriptions();
          assignRecipient();

          cy.findByLabelText("Attach results").should("not.be.checked");
          H.sendEmailAndAssert(
            ({ attachments }) => expect(attachments).to.be.empty,
          );
        },
      );
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

        H.sidebar().within(() => {
          cy.findByPlaceholderText("Enter user names or email addresses")
            .click()
            .type(`${normal.first_name} ${normal.last_name}{enter}`);
          clickButton("Done");

          cy.findByLabelText("add icon").click();
          cy.findByText("Email this dashboard").should("exist");
        });
      });

      it("should send as BCC by default", () => {
        const ORDERS_DASHBOARD_NAME = "Orders in a dashboard";

        assignRecipients();
        H.sidebar().within(() => {
          H.clickSend();
        });

        H.viewEmailPage(ORDERS_DASHBOARD_NAME);

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
        H.sidebar().within(() => {
          H.clickSend();
        });

        H.viewEmailPage(ORDERS_DASHBOARD_NAME);

        cy.get(".main-container").within(() => {
          cy.findByText("Bcc:").should("not.exist");
          cy.findByText(`${admin.email}`).should("exist");
          cy.findByText(`${normal.email}`).should("exist");
        });
      });
    });

    describe("let non-users unsubscribe from subscriptions", () => {
      it("should allow non-user to unsubscribe from subscription", () => {
        const nonUserEmail = "non-user@example.com";
        const dashboardName = "Orders in a dashboard";

        H.visitDashboard(ORDERS_DASHBOARD_ID);

        H.setupSubscriptionWithRecipients([nonUserEmail]);

        H.emailSubscriptionRecipients();

        H.openEmailPage(dashboardName).then(() => {
          cy.intercept("/api/pulse/unsubscribe").as("unsubscribe");
          cy.findByText("Unsubscribe").click();
          cy.wait("@unsubscribe");
          cy.contains(
            `You've unsubscribed ${nonUserEmail} from the "${dashboardName}" alert.`,
          ).should("exist");
        });

        openDashboardSubscriptions();
        H.openPulseSubscription();

        H.sidebar().findByText(nonUserEmail).should("not.exist");
      });

      it("should allow non-user to undo-unsubscribe from subscription", () => {
        const nonUserEmail = "non-user@example.com";
        const dashboardName = "Orders in a dashboard";
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        H.setupSubscriptionWithRecipients([nonUserEmail]);

        H.emailSubscriptionRecipients();

        H.openEmailPage(dashboardName).then(() => {
          cy.intercept("/api/pulse/unsubscribe").as("unsubscribe");
          cy.intercept("/api/pulse/unsubscribe/undo").as("resubscribe");

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
        H.openPulseSubscription();

        H.sidebar().findByText(nonUserEmail).should("exist");
      });

      it("should show 404 page when missing required parameters", () => {
        const nonUserEmail = "non-user@example.com";

        const params = {
          hash: "459a8e9f8d9e",
          email: nonUserEmail,
        }; // missing pulse-id

        cy.visit({
          url: "/unsubscribe",
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
          url: "/unsubscribe",
          qs: params,
        });

        cy.findByLabelText("error message").should("exist");
      });
    });

    it("should persist attachments for dashboard subscriptions (metabase#14117)", () => {
      assignRecipient();
      // This is extremely fragile
      // TODO: update test once changes from `https://github.com/metabase/metabase/pull/14121` are merged into `master`
      cy.findByLabelText("Attach results").click();
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
        .contains("Orders")
        .closest("li")
        .within(() => {
          cy.findByRole("checkbox").should("be.checked");
        });
    });

    it("should send only attachments without email content when 'Send only attachments' is enabled", () => {
      assignRecipient();

      cy.findByLabelText("Attach results").click();
      cy.findByLabelText("Questions to attach").click();
      cy.findByLabelText("Send only attachments").click();
      cy.findByLabelText("Send only attachments").should("be.checked");

      H.sendEmailAndAssert((email) => {
        expect(email.attachments).to.not.be.empty;
        const csvAttachment = email.attachments.find(
          (attachment) => attachment.contentType === "text/csv",
        );
        expect(csvAttachment).to.exist;
        expect(csvAttachment.fileName).to.include("Orders");
        expect(email.html).to.not.include("Orders chart");
        expect(email.html).to.include(
          "Dashboard content available in attached files",
        );
        expect(email.html).to.include("Orders in a dashboard");
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
      H.createNativeQuestion({
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
        H.createDashboard({ name: "15705D" }).then(
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
            H.addOrUpdateDashboardCard({
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
      H.sendEmailAndAssert((email) => {
        expect(email.html).not.to.include(
          "An error occurred while displaying this card.",
        );
        expect(email.html).to.include("2,738");
      });
    });

    it("should include text cards (metabase#15744)", () => {
      const TEXT_CARD = "FooBar";

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.addTextBox(TEXT_CARD);
      cy.button("Save").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("You're editing this dashboard.").should("not.exist");
      assignRecipient();
      // Click outside popover to close it and at the same time check that the text card content is shown as expected
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(TEXT_CARD).click();
      H.sendEmailAndAssert((email) => {
        expect(email.html).to.include(TEXT_CARD);
      });
    });

    it('should load question binned by "Month of year" or similar granularity (metabase#16918)', () => {
      const questionDetails = {
        name: "16918",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              PRODUCTS.CREATED_AT,
              { "temporal-unit": "month-of-year" },
            ],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        },
        display: "line",
      };

      const dashboardDetails = { name: "Repro Dashboard" };

      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: { dashboard_id } }) => {
          assignRecipient({ dashboard_id });
        },
      );

      H.sendEmailAndAssert((email) => {
        expect(email.html).to.include(dashboardDetails.name);
        expect(email.html).to.include(questionDetails.name);
      });
    });
  });

  describe("with Slack set up", () => {
    beforeEach(() => {
      H.mockSlackConfigured();
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

      H.sidebar().within(() => {
        cy.findAllByRole("button", { name: "Send to Slack now" }).should(
          "be.disabled",
        );
        cy.findByPlaceholderText("Pick a user or channel...").click();
      });

      H.popover().findByText("#work").click();
      H.sidebar()
        .findAllByRole("button", { name: "Done" })
        .should("not.be.disabled");
    });

    it("should allow non-admin users to create subscriptions", () => {
      cy.signInAsNormalUser();
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.openSharingMenu();
      H.sharingMenu().findByText("Subscriptions").should("be.visible");
    });
  });

  describe("OSS email subscriptions", { tags: ["@OSS", "external"] }, () => {
    beforeEach(() => {
      H.setupSMTP();
      cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    });

    it("should include branding", () => {
      assignRecipient();
      H.sendEmailAndVisitIt();
      cy.findAllByRole("link")
        .filter(":contains(Orders in a dashboard)")
        .should("be.visible");
      cy.findAllByRole("link")
        .filter(":contains(Made with)")
        .should("contain", "Metabase")
        .and(
          "have.attr",
          "href",
          "https://www.metabase.com?utm_source=product&utm_medium=export&utm_campaign=exports_branding&utm_content=dashboard_subscription",
        );
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
          .should("contain.text", "Text: Corbin Mertz");
        clickButton("Done");

        cy.get("[aria-label='Pulse Card']")
          .should("contain.text", "Text: Corbin Mertz")
          .click();

        H.sendEmailAndVisitIt();
        cy.get("table.header")
          .first()
          .within(() => {
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

        H.popover().within(() => {
          cy.findByText("Corbin Mertz").click();
          cy.findByPlaceholderText("Search the list").type(
            "Sallie Flatley{enter}",
          );
          cy.findByText("Sallie Flatley").click();
        });
        H.popover().button("Update filter").click();

        cy.button("Save").click();

        // verify existing subscription shows new default in UI
        openDashboardSubscriptions();
        cy.get("[aria-label='Pulse Card']")
          .findByText("Text: Sallie Flatley")
          .click();

        // verify existing subscription show new default in email
        H.sendEmailAndVisitIt();
        cy.get("table.header")
          .first()
          .within(() => {
            cy.findByText("Text").next().findByText("Sallie Flatley");
            cy.findByText("Text 1").should("not.exist");
          });
      });
    });
  });

  describe("EE email subscriptions", { tags: "@external" }, () => {
    beforeEach(() => {
      H.activateToken("pro-self-hosted");
      H.setupSMTP();
      cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    });

    it("should not include branding", () => {
      assignRecipient();
      H.sendEmailAndVisitIt();
      cy.findAllByRole("link")
        .filter(":contains(Orders in a dashboard)")
        .should("be.visible");
      cy.findAllByRole("link")
        .filter(":contains(Made with)")
        .should("not.exist");
    });

    it("should only show current user in recipients dropdown if `user-visiblity` setting is `none`", () => {
      openRecipientsWithUserVisibilitySetting("none");

      H.popover().find("span").should("have.length", 1);
    });

    it("should only show users in same group in recipients dropdown if `user-visiblity` setting is `group`", () => {
      openRecipientsWithUserVisibilitySetting("group");

      H.popover().find("span").should("have.length", 5);
    });

    it("should show all users in recipients dropdown if `user-visiblity` setting is `all`", () => {
      openRecipientsWithUserVisibilitySetting("all");

      H.popover().find("span").should("have.length", 10);
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

    it("should send a dashboard with questions saved in the dashboard", () => {
      H.createQuestion({
        name: "Total Orders",
        database_id: SAMPLE_DATABASE.id,
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      assignRecipient();
      H.sendEmailAndVisitIt();

      cy.get(".container").within(() => {
        cy.findByText("Total Orders");
        cy.findAllByText("18,760").should("have.length", 2);
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
          .findByText("Text: Corbin Mertz")
          .click();

        // verify defaults are listed correctly in email
        H.sendEmailAndVisitIt();
        cy.get("table.header")
          .first()
          .within(() => {
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

        H.popover().within(() => {
          cy.findByText("Corbin Mertz").click();
          cy.findByPlaceholderText("Search the list").type(
            "Sallie Flatley{enter}",
          );
          cy.findByText("Sallie Flatley").click();
        });
        H.popover().button("Update filter").click();
        cy.button("Save").click();

        // verify existing subscription shows new default in UI
        openDashboardSubscriptions();
        cy.get("[aria-label='Pulse Card']")
          .findByText("Text: Sallie Flatley")
          .click();

        // verify existing subscription show new default in email
        H.sendEmailAndVisitIt();
        cy.get("table.header")
          .first()
          .within(() => {
            cy.findByText("Text").next().findByText("Sallie Flatley");
            cy.findByText("Text 1").should("not.exist");
          });
      });

      it("should allow for setting parameters in subscription", () => {
        assignRecipient();
        clickButton("Done");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Emailed hourly").click();

        // eslint-disable-next-line no-unsafe-element-filtering
        cy.findAllByText("Corbin Mertz").last().click();
        H.popover().within(() => {
          H.fieldValuesCombobox().type("Bob");
          cy.findByText("Bobby Kessler").click();
        });
        H.popover().contains("Update filter").click();

        // eslint-disable-next-line no-unsafe-element-filtering
        cy.findAllByText("Text 1").last().click();
        H.popover().findByText("Gizmo").click();
        H.popover().contains("Add filter").click();

        cy.intercept("PUT", "/api/pulse/*").as("pulsePut");

        clickButton("Done");
        cy.wait("@pulsePut");
        cy.findByTestId("dashboard-parameters-and-cards")
          .next("aside")
          .findByText("Text: 2 selections and 1 more filter")
          .click();

        H.sendEmailAndVisitIt();
        cy.get("table.header").within(() => {
          cy.findByText("Text")
            .next()
            .findByText("Corbin Mertz and Bobby Kessler");
          cy.findByText("Text 1").next().findByText("Gizmo");
        });
      });
    });

    describe("with unconnected parameters", () => {
      it("should show only connected parameters in subscription sidebar", () => {
        addConnectedAndUnconnectedParameterToDashboard();
        openDashboardSubscriptions(ORDERS_DASHBOARD_ID);

        H.sidebar().findByText("Email it").click();
        H.sidebar().findByText("Text 1").should("not.exist");
      });

      it("should not show filters section in subscription sidebar with no connected parameters", () => {
        H.editDashboard();
        setTextFilter();
        openDashboardSubscriptions(ORDERS_DASHBOARD_ID);

        H.sidebar().findByText("Email it").click();
        H.sidebar()
          .findByText("Set filter values for when this gets sent")
          .should("not.exist");
      });
    });

    describe("modular embedding", () => {
      it("should not include links to Metabase", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        H.openSharingMenu();
        H.sharingMenu().findByRole("menuitem", { name: "Embed" }).click();
        cy.findByLabelText("Metabase account (SSO)").click();
        embedModalEnableEmbedding();
        cy.findByLabelText("Allow subscriptions").check().should("be.checked");
        H.getIframeBody().within(() => {
          cy.button("Subscriptions").click();
          H.sendEmailAndVisitIt();
        });

        cy.log(
          "Links should be disabled in modular embedding and modular embedding SDK subscription emails",
        );
        cy.findAllByRole("table")
          .first()
          .findByText("Orders in a dashboard")
          .should("exist");
        cy.findAllByRole("link").should("not.exist");
      });
    });
  });
});

// Helper functions
function openDashboardSubscriptions(dashboard_id = ORDERS_DASHBOARD_ID) {
  // Orders in a dashboard
  H.visitDashboard(dashboard_id);
  H.openSharingMenu("Subscriptions");
}

function assignRecipient({
  user = admin,
  dashboard_id = ORDERS_DASHBOARD_ID,
} = {}) {
  openDashboardSubscriptions(dashboard_id);
  cy.findByText("Email it").click();

  cy.findByPlaceholderText("Enter user names or email addresses")
    .type(`${user.first_name} ${user.last_name}{enter}`)
    .blur();
}

function assignRecipients({
  users = [admin, normal],
  dashboard_id = ORDERS_DASHBOARD_ID,
} = {}) {
  openDashboardSubscriptions(dashboard_id);
  cy.findByText("Email it").click();

  cy.findByPlaceholderText("Enter user names or email addresses").click();
  users.forEach(({ first_name }) => H.popover().contains(first_name).click());
  cy.realPress("Escape");
}

function clickButton(name) {
  cy.button(name).should("not.be.disabled").click();
}

function createEmailSubscription() {
  assignRecipient();
  clickButton("Done");
}

function openSlackCreationForm() {
  openDashboardSubscriptions();
  H.sidebar().findByText("Send it to Slack").click();
  H.sidebar().findByText("Send this dashboard to Slack");
}

function openRecipientsWithUserVisibilitySetting(setting) {
  H.updateSetting("user-visibility", setting);
  cy.signInAsNormalUser();
  openDashboardSubscriptions();

  H.sidebar()
    .findByPlaceholderText("Enter user names or email addresses")
    .click();
}

function addParametersToDashboard() {
  H.editDashboard();

  setTextFilter();

  cy.findByText("Select…").click();
  H.popover().within(() => {
    cy.findByText("Name").click();
  });

  // add default value to the above filter
  cy.findByText("No default").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Search the list").type("Corbin");
  });

  H.popover().findByText("Corbin Mertz").click();

  H.popover().contains("Add filter").click({ force: true });

  setTextFilter();

  cy.findByText("Select…").click();
  H.popover().within(() => {
    cy.findByText("Category").click();
  });

  cy.findByText("Save").click();
  cy.contains("You're editing this dashboard.").should("not.exist");
}

function addConnectedAndUnconnectedParameterToDashboard() {
  H.editDashboard();

  setTextFilter();
  cy.findByText("Select…").click();
  H.popover().within(() => {
    cy.findByText("Name").click();
  });

  setTextFilter();

  cy.findByText("Save").click();
  cy.contains("You're editing this dashboard.").should("not.exist");
}

function setTextFilter() {
  H.setFilter("Text or Category", "Is");
}
