const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { embedModalEnableEmbedding } from "e2e/support/helpers";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { DashboardId } from "metabase-types/api";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;
const { admin, normal } = USERS;

type Email = {
  html: string;
  attachments: { contentType: string; fileName: string }[];
};

describe("scenarios > dashboard > subscriptions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("with email set up", { tags: "@external" }, () => {
    beforeEach(() => {
      H.setupSMTP();
    });

    it("renders object detail, month-of-year line, and region map cards in a subscription email (metabase#16918)", () => {
      const regionMapDetails = {
        name: "Region map static-viz smoke",
        native: {
          query:
            "SELECT 'CA' AS state, 99999 AS metric " +
            "UNION ALL SELECT 'NY' AS state, 11111 AS metric",
        },
        display: "map",
        visualization_settings: {
          "map.type": "region",
          "map.region": "us_states",
          "map.dimension": "STATE",
          "map.metric": "METRIC",
        },
      } satisfies NativeQuestionDetails;

      const objectDetailDetails = {
        name: "Object detail static-viz smoke",
        native: {
          query: "SELECT 'Hammer' AS product, 19 AS price, NULL AS discount",
        },
        display: "object",
      } satisfies NativeQuestionDetails;

      const monthOfYearDetails = {
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
      } satisfies StructuredQuestionDetails;

      const dashboardName = "Repro Dashboard";

      H.createDashboardWithQuestions({
        dashboardName,
        questions: [regionMapDetails, objectDetailDetails, monthOfYearDetails],
        cards: [{ row: 0 }, { row: 8 }, { row: 16 }],
      }).then(({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      });

      H.openAndAddEmailsToSubscriptions([
        `${admin.first_name} ${admin.last_name}`,
      ]);

      H.sendEmailAndAssert(({ html }: Email) => {
        expect(html).not.to.include(
          "An error occurred while displaying this card.",
        );
        expect(html).to.include(dashboardName);

        const regionMapStart = html.indexOf(regionMapDetails.name);
        const objectDetailStart = html.indexOf(objectDetailDetails.name);
        const monthOfYearStart = html.indexOf(monthOfYearDetails.name);
        expect(regionMapStart).to.be.greaterThan(-1);
        expect(objectDetailStart).to.be.greaterThan(regionMapStart);
        expect(monthOfYearStart).to.be.greaterThan(objectDetailStart);

        const regionMapSection = html.slice(regionMapStart, objectDetailStart);
        const objectDetailSection = html.slice(
          objectDetailStart,
          monthOfYearStart,
        );

        expect(regionMapSection).to.match(
          /<img src="cid:[^"]+" style="display: block; width: 100%;"/,
        );
        // The map rasterizes to a PNG; a table fallback would instead leak these values as text.
        expect(html).not.to.include("99999");
        expect(html).not.to.include("11111");
        expect(html).not.to.include("99,999");
        expect(html).not.to.include("11,111");

        expect(objectDetailSection).to.include("Hammer");
        // "Empty" (the null column) is unique to the :object renderer — a table fallback leaves it blank.
        expect(objectDetailSection).to.include("Empty");
      });
    });

    describe("with no existing subscriptions", () => {
      it("should keep the people dropdown within the viewport (metabase#17186)", () => {
        Cypress._.times(30, (index) => {
          cy.request("POST", "/api/user", {
            first_name: `Recipient${index}`,
            last_name: "Example",
            email: `recipient${index}@metabase.test`,
          });
        });

        openDashboardSubscriptions(ORDERS_DASHBOARD_ID);

        H.sidebar().findByText("Email it").click();

        cy.findByPlaceholderText("Enter user names or email addresses").click();
        H.popover().should("be.visible").and("contain", `${admin.first_name}`);
        H.popover().should(($popover) => {
          const rect = $popover[0].getBoundingClientRect();
          const viewportHeight =
            $popover[0].ownerDocument.defaultView?.innerHeight ?? 0;
          expect(rect.top).to.be.greaterThan(0);
          expect(rect.bottom).not.to.be.greaterThan(viewportHeight);
        });
      });
    });

    describe("with existing subscriptions", () => {
      it("should send as BCC by default and as CC when opted-in", () => {
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

        H.clearInbox();

        // opt-in to CC
        cy.visit("/admin/settings/email");
        cy.findByTestId("bcc-enabled?-setting")
          .findByLabelText("CC - Disclose recipients")
          .click();

        assignRecipients();
        H.sidebar().within(() => {
          H.clickSend();
        });

        H.viewEmailPage(ORDERS_DASHBOARD_NAME);

        cy.get(".main-container").within(() => {
          cy.findByText(`${admin.email}`).should("exist");
          cy.findByText(`${normal.email}`).should("exist");
          cy.findByText("Bcc:").should("not.exist");
        });
      });
    });

    describe("let non-users unsubscribe from subscriptions", () => {
      it("should allow non-user to unsubscribe and undo-unsubscribe from subscription", () => {
        const nonUserEmail = "non-user@example.com";
        const dashboardName = "Orders in a dashboard";
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        H.setupSubscriptionWithRecipients([nonUserEmail]);

        H.emailSubscriptionRecipients();

        H.openEmailPage(dashboardName).then(() => {
          cy.intercept({
            method: "POST",
            pathname: "/api/pulse/unsubscribe",
          }).as("unsubscribe");
          cy.intercept({
            method: "POST",
            pathname: "/api/pulse/unsubscribe/undo",
          }).as("resubscribe");

          cy.findByRole("link", { name: "Unsubscribe" }).click();
          cy.findByRole("button", { name: "Confirm unsubscribe" }).click();
          cy.wait("@unsubscribe");

          cy.findByRole("button", { name: "Undo" }).should("be.visible");

          cy.findByText("Undo").click();
          cy.wait("@resubscribe");

          cy.findByRole("button", { name: "Unsubscribe" }).should("be.visible");
        });

        openDashboardSubscriptions();
        H.openPulseSubscription();

        H.sidebar().findByText(nonUserEmail).should("exist");

        H.openEmailPage(dashboardName).then(() => {
          cy.findByRole("link", { name: "Unsubscribe" }).click();
          cy.findByRole("button", { name: "Confirm unsubscribe" }).click();
          cy.wait("@unsubscribe");
          cy.findByRole("button", { name: "Undo" }).should("be.visible");
        });

        openDashboardSubscriptions();
        H.openPulseSubscription();

        H.sidebar().findByText("Delete this subscription").should("exist");
        H.sidebar().findByText(nonUserEmail).should("not.exist");
      });
    });

    it("should send only attachments without email content when 'Send only attachments' is enabled", () => {
      assignRecipient();

      cy.findByLabelText("Attach results")
        .should("not.be.checked")
        .click({ force: true }); // Input is placed behind the lable due to tooltip in label
      cy.findByLabelText("Questions to attach").click();
      cy.findByLabelText("Send only attachments")
        .should("not.be.checked")
        .click({ force: true }); // Input is placed behind the lable due to tooltip in label
      cy.findByLabelText("Send only attachments").should("be.checked");

      H.sendEmailAndAssert((email: Email) => {
        expect(email.attachments).to.not.be.empty;
        const csvAttachment = email.attachments.find(
          (attachment) => attachment.contentType === "text/csv",
        );
        expect(csvAttachment).to.exist;
        expect(csvAttachment?.fileName).to.include("Orders");
        expect(email.html).to.not.include("Orders chart");
        expect(email.html).to.include(
          "Dashboard content available in attached files",
        );
        expect(email.html).to.include("Orders in a dashboard");
      });
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("15705D").click();
      H.sendEmailAndAssert((email: Email) => {
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("You're editing this dashboard.").should("not.exist");
      assignRecipient();
      // Click outside popover to close it and at the same time check that the text card content is shown as expected
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(TEXT_CARD).click();
      H.sendEmailAndAssert((email: Email) => {
        expect(email.html).to.include(TEXT_CARD);
      });
    });
  });

  describe("with Slack set up", () => {
    beforeEach(() => {
      H.mockSlackConfigured();
    });

    it("should save the immutable Slack channel_id and list the subscription after a reload (metabase#14515)", () => {
      cy.intercept("POST", "/api/pulse").as("createPulse");

      openSlackCreationForm();

      H.sidebar().findByPlaceholderText("Pick a user or channel...").click();
      H.popover().findByText("#work").click();
      H.sidebar().button("Done").click();

      cy.wait("@createPulse").then(({ request: { body }, response }) => {
        expect(response?.statusCode).to.eq(200);
        // The mocked channel `#work` has id `C001` in e2e-slack-helpers.js.
        // Storing the immutable channel_id at save time is what makes the
        // subscription survive future channel renames in Slack.
        const slackChannel = body.channels.find(
          (channel: { channel_type: string }) =>
            channel.channel_type === "slack",
        );
        expect(slackChannel.details.channel).to.eq("#work");
        expect(slackChannel.details.channel_id).to.eq("C001");
      });

      openDashboardSubscriptions();
      H.sidebar().findByText("Sent to #work hourly").should("be.visible");
    });
  });

  describe("OSS email subscriptions", { tags: ["@OSS", "@external"] }, () => {
    beforeEach(() => {
      H.setupSMTP();
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
        cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
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
    });

    it("should send a dashboard with questions saved in the dashboard and without branding", () => {
      H.createQuestion({
        name: "Total Orders",
        database: SAMPLE_DATABASE.id,
        dashboard_id: ORDERS_DASHBOARD_ID,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      assignRecipient();
      H.sendEmailAndVisitIt();

      cy.findAllByRole("link")
        .filter(":contains(Orders in a dashboard)")
        .should("be.visible");
      cy.findAllByRole("link")
        .filter(":contains(Made with)")
        .should("not.exist");

      cy.get(".container").within(() => {
        cy.findByText("Total Orders");
        // the scalar counts all orders, but the body-only Orders table is
        // capped at the 2,000-row display limit so its truncation note no
        // longer says 18,760 (GDGT-2773)
        cy.findAllByText("18,760").should("have.length", 1);
        cy.findByText("2,000");
      });
    });

    describe("with parameters", () => {
      beforeEach(() => {
        cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
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

        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Emailed hourly").click();

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        cy.findAllByText("Corbin Mertz").last().click();
        H.popover().within(() => {
          H.fieldValuesCombobox().type("Bob");
          cy.findByText("Bobby Kessler").click();
        });
        H.popover().contains("Update filter").click();

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
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

    describe("modular embedding", () => {
      it("should not include links to Metabase", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        H.openSharingMenu();
        H.sharingMenu().findByRole("button", { name: "Embed" }).click();
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
  H.toggleDashboardSubscriptionsSidebar();
}

function assignRecipient({
  user = admin,
  dashboard_id = ORDERS_DASHBOARD_ID,
}: { user?: typeof admin; dashboard_id?: DashboardId } = {}) {
  openDashboardSubscriptions(dashboard_id);
  cy.findByText("Email it").click();

  cy.findByPlaceholderText("Enter user names or email addresses").click();
  H.popover().contains(user.first_name).click();
  cy.realPress("Escape");
}

function assignRecipients({
  users = [admin, normal],
  dashboard_id = ORDERS_DASHBOARD_ID,
}: { users?: (typeof admin)[]; dashboard_id?: DashboardId } = {}) {
  openDashboardSubscriptions(dashboard_id);
  cy.findByText("Email it").click();

  cy.findByPlaceholderText("Enter user names or email addresses").click();
  users.forEach(({ first_name }) => H.popover().contains(first_name).click());
  cy.realPress("Escape");
}

function clickButton(name: string) {
  cy.button(name).should("not.be.disabled").click();
}

function openSlackCreationForm() {
  openDashboardSubscriptions();
  H.sidebar().findByText("Send it to Slack").click();
  H.sidebar().findByText("Send this dashboard to Slack");
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

function setTextFilter() {
  H.setFilter("Text or Category", "Is");
}
