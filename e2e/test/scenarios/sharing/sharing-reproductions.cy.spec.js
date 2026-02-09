const { H } = cy;
import { SAMPLE_DB_ID, USERS, WEBMAIL_CONFIG } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_USER_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { admin } = USERS;
const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
} = SAMPLE_DATABASE;
const { WEB_PORT } = WEBMAIL_CONFIG;

describe("sharing reproductions", () => {
  before(() => {
    H.restore();
  });

  describe("issue 18009", { tags: "@external" }, () => {
    beforeEach(() => {
      cy.signInAsAdmin();

      H.setupSMTP();

      cy.signIn("nodata");
    });

    it("nodata user should be able to create and receive an email subscription without errors (metabase#18009)", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.openSharingMenu("Subscriptions");

      H.sidebar()
        .findByPlaceholderText("Enter user names or email addresses")
        .click();
      H.popover()
        .contains(/^No Data/)
        .click();

      // Click anywhere to close the popover that covers the "Send email now" button
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("To:").click();

      H.sendEmailAndAssert((email) => {
        expect(email.html).not.to.include(
          "An error occurred while displaying this card.",
        );

        expect(email.html).to.include("37.65");
      });
    });
  });

  describe("issue 18344", { tags: "@external" }, () => {
    const {
      admin: { first_name, last_name },
    } = USERS;

    beforeEach(() => {
      cy.signInAsAdmin();

      H.setupSMTP();

      // Rename the question
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.editDashboard();

      // Open visualization options
      cy.findByTestId("dashcard").realHover();
      cy.icon("palette").click();

      H.modal().within(() => {
        cy.findByDisplayValue("Orders").type("Foo").blur();

        cy.button("Done").click();
      });

      H.saveDashboard();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("OrdersFoo");
    });

    it("subscription should not include original question name when it's been renamed in the dashboard (metabase#18344)", () => {
      // Send a test email subscription
      H.openSharingMenu("Subscriptions");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Email it").click();

      cy.findByPlaceholderText("Enter user names or email addresses").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${first_name} ${last_name}`).click();
      // Click this just to close the popover that is blocking the "Send email now" button
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("To:").click();

      H.sendEmailAndAssert((email) => {
        expect(email.html).to.include("OrdersFoo");
      });
    });
  });

  describe("issue 18352", { tags: "@external" }, () => {
    const {
      admin: { first_name, last_name },
    } = USERS;

    const questionDetails = {
      name: "18352",
      native: {
        query: "SELECT 'foo', 1 UNION ALL SELECT 'bar', 2",
      },
    };

    beforeEach(() => {
      cy.signInAsAdmin();

      H.setupSMTP();

      H.createNativeQuestionAndDashboard({ questionDetails }).then(
        ({ body: { card_id, dashboard_id } }) => {
          H.visitQuestion(card_id);

          H.visitDashboard(dashboard_id);
        },
      );
    });

    it("should send the card with the INT64 values (metabase#18352)", () => {
      H.openSharingMenu("Subscriptions");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Email it").click();

      cy.findByPlaceholderText("Enter user names or email addresses").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${first_name} ${last_name}`).click();
      // Click this just to close the popover that is blocking the "Send email now" button
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("To:").click();

      H.sendEmailAndAssert(({ html }) => {
        expect(html).not.to.include(
          "An error occurred while displaying this card.",
        );

        expect(html).to.include("foo");
        expect(html).to.include("bar");
      });
    });
  });

  describe("issue 18669", { tags: "@external" }, () => {
    const questionDetails = {
      name: "Product count",
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
      },
    };

    const filterDetails = {
      name: "Category",
      slug: "category",
      id: "c32a49e1",
      type: "category",
      default: ["Doohickey"],
    };

    const dashboardDetails = {
      parameters: [filterDetails],
    };

    const getFilterMapping = (card) => ({
      parameter_mappings: [
        {
          parameter_id: filterDetails.id,
          card_id: card.card_id,
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        },
      ],
    });

    beforeEach(() => {
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.setupSMTP();

      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: card }) => {
          H.editDashboardCard(card, getFilterMapping(card));
          H.visitDashboard(card.dashboard_id);
        },
      );
    });

    it("should send a test email with non-default parameters (metabase#18669)", () => {
      H.openSharingMenu("Subscriptions");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Email it").click();

      cy.findByPlaceholderText("Enter user names or email addresses")
        .click()
        .type(`${admin.first_name} ${admin.last_name}{enter}`)
        .blur();

      H.sidebar().within(() => {
        cy.findByText("Doohickey").click();
      });

      H.popover().within(() => {
        cy.findByText("Gizmo").click();
        cy.button("Update filter").click();
      });

      H.clickSend();
    });
  });

  describe("issue 20393", () => {
    function createDashboardWithNestedCard() {
      H.createNativeQuestion({
        name: "Q1",
        native: { query: 'SELECT * FROM "ORDERS"', "template-tags": {} },
      }).then(({ body }) =>
        H.createQuestionAndDashboard({
          questionDetails: {
            name: "Q2",
            query: { "source-table": `card__${body.id}` },
          },
          dashboardDetails: {
            name: "Q2 in a dashboard",
          },
        }).then(({ body: { dashboard_id } }) => H.visitDashboard(dashboard_id)),
      );
    }

    beforeEach(() => {
      cy.intercept("POST", "/api/dashboard/*/public_link").as("publicLink");

      cy.signInAsAdmin();
    });

    it("should show public dashboards with nested cards mapped to parameters (metabase#20393)", () => {
      createDashboardWithNestedCard();

      H.editDashboard();

      H.setFilter("Date picker", "All Options");

      // map the date parameter to the card
      cy.findByTestId("dashcard-container").contains("Select").click();
      H.popover().contains("CREATED_AT").click();

      // save the dashboard
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();

      // open the sharing modal and enable sharing
      H.openNewPublicLinkDropdown("dashboard");

      // navigate to the public dashboard link
      cy.wait("@publicLink").then(({ response: { body } }) => {
        const { uuid } = body;

        cy.signOut();
        cy.visit(`/public/dashboard/${uuid}`);
      });

      // verify that the card is visible on the page
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Q2");
    });
  });

  describe("issue 21559", { tags: "@external" }, () => {
    const q1Details = {
      name: "21559-1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
      },
      display: "scalar",
    };

    const q2Details = {
      name: "21559-2",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
      },
      display: "scalar",
    };

    beforeEach(() => {
      cy.signInAsAdmin();

      H.setupSMTP();

      H.createQuestionAndDashboard({
        questionDetails: q1Details,
      }).then(({ body: { dashboard_id } }) => {
        H.createQuestion(q2Details);

        H.visitDashboard(dashboard_id);
        cy.findByTestId("scalar-value").should("have.text", "80.52");
        H.editDashboard();
      });
    });

    it("should respect dashboard card visualization (metabase#21559)", () => {
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      H.getDashboardCard(0)
        .realHover({ scrollBehavior: "bottom" })
        .findByLabelText("Visualize another way")
        .click();

      H.modal().within(() => {
        H.switchToAddMoreData();
        H.selectDataset(q2Details.name);
        cy.findByText("80.52").should("exist");
        H.horizontalWell().findAllByTestId("well-item").should("have.length", 2);
        cy.button("Save").click();
      });

      // Make sure visualization changed to funnel
      H.getDashboardCard(0).within(() => {
        cy.findByText("80.52").should("exist");
        cy.get("polygon[fill='#509EE2']").should("exist");
      });

      H.saveDashboard();

      // Wait for "Edited a few seconds ago" to disappear because the whole
      // dashboard re-renders after that!
      cy.findByTestId("revision-history-button").should("not.be.visible");
      H.openAndAddEmailsToSubscriptions([
        `${admin.first_name} ${admin.last_name}`,
      ]);
      H.sendEmailAndAssert((email) => {
        expect(email.html).to.include("img"); // Funnel is sent as img (inline attachment)
        expect(email.html).not.to.include("80.52"); // Scalar displays its value in HTML
      });
    });
  });

  describe("issue 22524", () => {
    const questionDetails = {
      name: "22524 question",
      native: {
        query: "select * from people where city = {{city}}",
        "template-tags": {
          city: {
            id: "6d077d39-a420-fd14-0b0b-a5eb611ce1e0",
            name: "city",
            "display-name": "City",
            type: "text",
          },
        },
      },
    };

    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("update dashboard cards when changing parameters on publicly shared dashboards (metabase#22524)", () => {
      H.createNativeQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          cy.intercept("POST", `/api/dashboard/${dashboard_id}/public_link`).as(
            "publicLink",
          );
          H.visitDashboard(dashboard_id);
        },
      );

      H.editDashboard();
      H.setFilter("Text or Category", "Is");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Select…").click();
      H.popover().contains("City").click();

      H.saveDashboard();

      // Share dashboard
      H.openNewPublicLinkDropdown("dashboard");

      cy.wait("@publicLink").then(({ response: { body } }) => {
        const { uuid } = body;

        cy.signOut();
        cy.visit(`/public/dashboard/${uuid}`);
      });

      // Set parameter value
      cy.findByPlaceholderText("Text").clear().type("Rye{enter}");

      // Check results
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("2-7900 Cuerno Verde Road");
    });
  });

  describe("issue 24223", () => {
    const questionDetails = {
      name: "24223",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const dropdownFilter = {
      name: "Category",
      slug: "category",
      id: "b613dce5",
      type: "string/=",
      sectionId: "string",
      default: ["Doohickey"],
    };

    const containsFilter = {
      name: "Title",
      slug: "title",
      id: "ffb5da68",
      type: "string/contains",
      sectionId: "string",
      default: ["Awesome"],
    };

    const parameters = [dropdownFilter, containsFilter];

    const dashboardDetails = { parameters };

    const mapFiltersToCard = (card_id) => ({
      parameter_mappings: [
        {
          parameter_id: dropdownFilter.id,
          card_id,
          target: [
            "dimension",
            [
              "field",
              PRODUCTS.CATEGORY,
              {
                "base-type": "type/Text",
                "source-field": ORDERS.PRODUCT_ID,
              },
            ],
          ],
        },
        {
          parameter_id: containsFilter.id,
          card_id,
          target: [
            "dimension",
            [
              "field",
              PRODUCTS.TITLE,
              {
                "base-type": "type/Text",
                "source-field": ORDERS.PRODUCT_ID,
              },
            ],
          ],
        },
      ],
    });

    beforeEach(() => {
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.setupSMTP();
    });

    it("should clear default filter (metabase#24223)", () => {
      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashboardCard }) => {
          const { card_id, dashboard_id } = dashboardCard;

          H.editDashboardCard(dashboardCard, mapFiltersToCard(card_id));

          H.visitDashboard(dashboard_id);
          cy.location("search").should("eq", "?category=Doohickey&title=Awesome");
          cy.findByTestId("dashcard").should("contain", "36.37");
        },
      );

      H.openAndAddEmailsToSubscriptions([
        `${admin.first_name} ${admin.last_name}`,
      ]);
      cy.findByTestId("subscription-parameters-section").within(() => {
        H.filterWidget({ name: "Category" }).icon("close").click();
      });

      H.sidebar().button("Done").click();

      cy.findByLabelText("Pulse Card")
        .should("contain", "Title: Awesome")
        .and("not.contain", "1 more filter")
        .click();

      H.sendEmailAndVisitIt();
      cy.get("table.header")
        .should("contain", containsFilter.name)
        .and("contain", "Awesome")
        .and("not.contain", dropdownFilter.name)
        .and("not.contain", "Doohickey");
    });
  });

  describe("issue 25473", () => {
    const ccName = "CC Reviewer";

    const dashboardFilter = {
      name: "Text ends with",
      slug: "text_ends_with",
      id: "3a8ecdbd",
      type: "string/ends-with",
      sectionId: "string",
    };

    const questionDetails = {
      name: "25473",
      query: {
        "source-table": REVIEWS_ID,
        expressions: { [ccName]: ["field", REVIEWS.REVIEWER, null] },
        limit: 10,
        // Let's show only a few columns to make it easier to focus on the UI
        fields: [
          ["field", REVIEWS.REVIEWER, null],
          ["field", REVIEWS.RATING, null],
          ["field", REVIEWS.CREATED_AT, null],
          ["expression", ccName, null],
        ],
      },
    };

    const dashboardDetails = {
      name: "25473D",
      parameters: [dashboardFilter],
    };

    function assertOnResults() {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByRole("columnheader").last().should("have.text", ccName);
      cy.findAllByText("xavier").should("have.length", 2);

      H.filterWidget().click();
      cy.findByPlaceholderText("Enter some text").type("e").blur();
      cy.button("Add filter").click();

      cy.location("search").should("eq", `?${dashboardFilter.slug}=e`);
      cy.findAllByText("xavier").should("not.exist");
      cy.findAllByText("cameron.nitzsche").should("have.length", 2);
    }

    beforeEach(() => {
      cy.signInAsAdmin();

      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: { id, card_id, dashboard_id } }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
            dashcards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                size_x: 16,
                size_y: 8,
                series: [],
                visualization_settings: {},
                parameter_mappings: [
                  {
                    parameter_id: dashboardFilter.id,
                    card_id,
                    target: ["dimension", ["expression", ccName, null]],
                  },
                ],
              },
            ],
          });

          cy.wrap(dashboard_id).as("dashboardId");
        },
      );
    });

    it("public sharing: dashboard text filter on a custom column should accept text input (metabase#25473-1)", () => {
      cy.get("@dashboardId").then((id) => {
        H.visitPublicDashboard(id);
      });

      assertOnResults();
    });

    it("signed embedding: dashboard text filter on a custom column should accept text input (metabase#25473-2)", () => {
      cy.get("@dashboardId").then((id) => {
        cy.request("PUT", `/api/dashboard/${id}`, {
          embedding_params: {
            [dashboardFilter.slug]: "enabled",
          },
          enable_embedding: true,
        });

        const payload = {
          resource: { dashboard: id },
          params: {},
        };

        H.visitEmbeddedPage(payload);
      });

      assertOnResults();
    });
  });

  describe("issue 26988", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/preview_embed/dashboard/*").as(
        "previewDashboard",
      );

      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("should apply embedding settings passed in URL on load", () => {
      H.createQuestionAndDashboard({
        questionDetails: {
          name: "Q1",
          query: {
            "source-table": ORDERS_ID,
            limit: 3,
          },
        },
        dashboardDetails: {
          enable_embedding: true,
        },
      }).then(({ body: card }) => {
        H.visitDashboard(card.dashboard_id);

        H.openLegacyStaticEmbeddingModal({
          resource: "dashboard",
          resourceId: card.dashboard_id,
          activeTab: "lookAndFeel",
          previewMode: "preview",
        });
      });

      cy.wait("@previewDashboard");
      H.getIframeBody().should("have.css", "font-family", "Lato, sans-serif");

      cy.findByLabelText("Customizing look and feel")
        .findByLabelText("Font")
        .as("font-control")
        .click();
      H.popover().findByText("Oswald").click();

      H.getIframeBody().should("have.css", "font-family", "Oswald, sans-serif");

      cy.get("@font-control").click();
      H.popover().findByText("Slabo 27px").click();

      H.getIframeBody().should(
        "have.css",
        "font-family",
        '"Slabo 27px", sans-serif',
      );
    });
  });

  describe("issue 30314", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.setupSMTP();
    });

    it("should clean the new subscription form on cancel (metabase#30314)", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.openSharingMenu("Subscriptions");
      H.sidebar().within(() => {
        cy.findByText("Email it").click();

        cy.findByLabelText("Attach results").should("not.be.checked").click();
        cy.findByLabelText("Questions to attach")
          .should("not.be.checked")
          .click();

        cy.button("Cancel").click();
        cy.findByText("Email it").click();

        cy.findByLabelText("Attach results").should("not.be.checked");
        cy.findByText("Questions to attach").should("not.exist");
        cy.findByText(".xlsx").should("not.exist");
        cy.findByText(".csv").should("not.exist");
      });
    });
  });

  describe("issue 17657", () => {
    const { first_name, last_name } = admin;

    function createSubscriptionWithoutRecipients() {
      cy.request("POST", "/api/pulse", {
        name: "Orders in a dashboard",
        cards: [
          {
            id: ORDERS_QUESTION_ID,
            collection_id: null,
            description: null,
            display: "table",
            name: "Orders",
            include_csv: false,
            include_xls: false,
            dashboard_card_id: 1,
            dashboard_id: ORDERS_DASHBOARD_ID,
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
        dashboard_id: ORDERS_DASHBOARD_ID,
      });
    }

    beforeEach(() => {
      cy.signInAsAdmin();

      createSubscriptionWithoutRecipients();
    });

    it("frontend should gracefully handle the case of a subscription without a recipient (metabase#17657)", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.openSharingMenu("Subscriptions");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Emailed monthly/).click();

      H.sidebar().within(() => {
        cy.button("Done").should("be.disabled");
      });

      // Open the popover with all users
      cy.findByPlaceholderText("Enter user names or email addresses").click();
      // Pick admin as a recipient
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${first_name} ${last_name}`).click();

      H.sidebar().within(() => {
        cy.button("Done").should("not.be.disabled");
      });
    });
  });

  describe("issue 17658", { tags: "@external" }, () => {
    function moveDashboardToCollection(collectionName) {
      const { first_name, last_name, email } = admin;

      cy.request("GET", "/api/collection/tree?tree=true").then(
        ({ body: collections }) => {
          const { id } = collections.find(
            (collection) => collection.name === collectionName,
          );

          // Move dashboard
          cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
            collection_id: id,
          });

          // Create subscription
          cy.request("POST", "/api/pulse", {
            name: "Orders in a dashboard",
            cards: [
              {
                id: ORDERS_QUESTION_ID,
                collection_id: null,
                description: null,
                display: "table",
                name: "Orders",
                include_csv: false,
                include_xls: false,
                dashboard_card_id: ORDERS_DASHBOARD_DASHCARD_ID,
                dashboard_id: ORDERS_DASHBOARD_ID,
                parameter_mappings: [],
              },
            ],
            channels: [
              {
                channel_type: "email",
                enabled: true,
                recipients: [
                  {
                    id: ADMIN_USER_ID,
                    email,
                    first_name,
                    last_name,
                    common_name: H.getFullName(admin),
                  },
                ],
                details: {},
                schedule_type: "monthly",
                schedule_day: "mon",
                schedule_hour: 8,
                schedule_frame: "first",
              },
            ],
            skip_if_empty: false,
            collection_id: id,
            parameters: [],
            dashboard_id: ORDERS_DASHBOARD_ID,
          });
        },
      );
    }

    beforeEach(() => {
      cy.intercept("PUT", "/api/pulse/*").as("deletePulse");
      cy.signInAsAdmin();

      H.setupSMTP();

      moveDashboardToCollection("First collection");
    });

    it("should delete dashboard subscription from any collection (metabase#17658)", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      H.openSharingMenu("Subscriptions");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Emailed monthly/).click();

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Delete this subscription").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^This dashboard will no longer be emailed to/).click();

      cy.button("Delete").click();

      cy.wait("@deletePulse").then(({ response }) => {
        expect(response.body.cause).not.to.exist;
        expect(response.statusCode).not.to.eq(500);
      });

      cy.button("Delete").should("not.exist");
    });
  });

  describe("issue 17547", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.mockSlackConfigured();

      H.createQuestion(questionDetails).then(({ body: { id: questionId } }) => {
        H.createQuestionAlert({
          user_id: ADMIN_USER_ID,
          card_id: questionId,
          handlers: [
            {
              channel_type: "channel/slack",
              recipients: [
                {
                  type: "notification-recipient/raw-value",
                  details: {
                    value: "#work",
                  },
                },
              ],
            },
          ],
        }).then(({ body: { id: alertId } }) => {
          cy.intercept("PUT", `/api/notification/${alertId}`).as("alertQuery");
        });

        H.visitQuestion(questionId);
      });
    });

    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
        ],
        aggregation: [["count"]],
      },
      display: "area",
    };

    it("editing an alert should not delete it (metabase#17547)", () => {
      cy.findByLabelText("Move, trash, and more…").click();
      H.popover().findByText("Edit alerts").click();
      H.modal().findByText("Check daily at 9:00 AM").should("be.visible").click();

      H.modal().within(() => {
        cy.findByText("PM").click();
        cy.button("Save changes").click();
      });

      cy.wait("@alertQuery");

      cy.findByTestId("toast-undo")
        .findByText("Your alert was updated.")
        .should("be.visible");

      H.modal().findByText("Check daily at 9:00 PM");
    });
  });

  describe("issue 16108", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should display a tooltip for CTA icons on an individual question (metabase#16108)", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      cy.icon("download").realHover();
      H.tooltip().findByText("Download results");
      H.sharingMenuButton().realHover();
      H.tooltip().findByText("Sharing");
    });
  });

  describe("issue 49525", { tags: "@external" }, () => {
    const {
      admin: { first_name, last_name },
    } = USERS;

    const q1Details = {
      name: "Pivot Table",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [
          ["datetime-field", ["field-id", PRODUCTS.CREATED_AT], "year"],
          ["field-id", PRODUCTS.CATEGORY],
        ],
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["CREATED_AT"],
          columns: ["CATEGORY"],
          values: ["COUNT"],
        },
      },
    };

    beforeEach(() => {
      cy.signInAsAdmin();

      H.setupSMTP();

      H.createQuestionAndDashboard({
        questionDetails: q1Details,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });
    });

    it("Subscriptions with 'Keep the data pivoted' checked should work (metabase#49525)", () => {
      // Send a test email subscription
      H.openSharingMenu("Subscriptions");
      H.sidebar().within(() => {
        cy.findByText("Email it").click();
        cy.findByPlaceholderText("Enter user names or email addresses").click();
      });

      H.popover().findByText(`${first_name} ${last_name}`).click();

      H.sidebar().within(() => {
        // Click this just to close the popover that is blocking the "Send email now" button
        cy.findByText("To:").click();
        cy.findByLabelText("Attach results").click();
        cy.findByText("Keep the data pivoted").click();
        cy.findByText("Questions to attach").click();
      });

      H.sendEmailAndAssert((email) => {
        // Get the CSV attachment data
        const csvAttachment = email.attachments.find(
          (attachment) => attachment.contentType === "text/csv",
        );

        expect(csvAttachment).to.exist;

        // get the csv attachment file's contents
        cy.request({
          method: "GET",
          url: `http://localhost:${WEB_PORT}/email/${email.id}/attachment/${csvAttachment.generatedFileName}`,
          encoding: "utf8",
        }).then((response) => {
          const csvContent = response.body;
          const rows = csvContent.split("\n");
          const headers = rows[0];
          expect(headers).to.equal(
            "Created At: Year,Doohickey,Gadget,Gizmo,Widget,Row totals\r",
          );
        });
      });
    });
  });
});
