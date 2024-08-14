import { USERS, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ADMIN_USER_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  popover,
  setupSMTP,
  visitDashboard,
  sendEmailAndAssert,
  sidebar,
  editDashboard,
  saveDashboard,
  modal,
  visitQuestion,
  setTokenFeatures,
  clickSend,
  openNewPublicLinkDropdown,
  setFilter,
  describeEE,
  chartPathWithFillColor,
  sendEmailAndVisitIt,
  visitPublicDashboard,
  visitEmbeddedPage,
  getIframeBody,
  openStaticEmbeddingModal,
  dashboardHeader,
  filterWidget,
  getFullName,
  openAndAddEmailsToSubscriptions,
  createQuestionAndDashboard,
  createQuestion,
  getDashboardCard,
} from "e2e/support/helpers";

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

describe("issue 18009", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    cy.signIn("nodata");
  });

  it("nodata user should be able to create and receive an email subscription without errors (metabase#18009)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);

    cy.findByLabelText("subscriptions").click();

    sidebar()
      .findByPlaceholderText("Enter user names or email addresses")
      .click();
    popover()
      .contains(/^No Data/)
      .click();

    // Click anywhere to close the popover that covers the "Send email now" button
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("To:").click();

    sendEmailAndAssert(email => {
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
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    // Rename the question
    visitDashboard(ORDERS_DASHBOARD_ID);

    editDashboard();

    // Open visualization options
    cy.findByTestId("dashcard").realHover();
    cy.icon("palette").click();

    modal().within(() => {
      cy.findByDisplayValue("Orders").type("Foo").blur();

      cy.button("Done").click();
    });

    saveDashboard();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("OrdersFoo");
  });

  it("subscription should not include original question name when it's been renamed in the dashboard (metabase#18344)", () => {
    // Send a test email subscription
    cy.icon("subscription").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${first_name} ${last_name}`).click();
    // Click this just to close the popover that is blocking the "Send email now" button
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("To:").click();

    sendEmailAndAssert(email => {
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
    cy.findByText("To:").click();

    sendEmailAndAssert(({ html }) => {
      expect(html).not.to.include(
        "An error occurred while displaying this card.",
      );

      expect(html).to.include("foo");
      expect(html).to.include("bar");
    });
  });
});

describeEE("issue 18669", { tags: "@external" }, () => {
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

  const getFilterMapping = card => ({
    parameter_mappings: [
      {
        parameter_id: filterDetails.id,
        card_id: card.card_id,
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    ],
  });

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    setupSMTP();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: card }) => {
        cy.editDashboardCard(card, getFilterMapping(card));
        visitDashboard(card.dashboard_id);
      },
    );
  });

  it("should send a test email with non-default parameters (metabase#18669)", () => {
    cy.icon("subscription").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${admin.first_name} ${admin.last_name}{enter}`)
      .blur();

    sidebar().within(() => {
      cy.findByText("Doohickey").click();
    });

    popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Update filter").click();
    });

    clickSend();
  });
});

describe("issue 20393", () => {
  function createDashboardWithNestedCard() {
    cy.createNativeQuestion({
      name: "Q1",
      native: { query: 'SELECT * FROM "ORDERS"', "template-tags": {} },
    }).then(({ body }) =>
      cy
        .createQuestionAndDashboard({
          questionDetails: {
            name: "Q2",
            query: { "source-table": `card__${body.id}` },
          },
          dashboardDetails: {
            name: "Q2 in a dashboard",
          },
        })
        .then(({ body: { dashboard_id } }) => visitDashboard(dashboard_id)),
    );
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/public_link").as("publicLink");

    restore();
    cy.signInAsAdmin();
  });

  it("should show public dashboards with nested cards mapped to parameters (metabase#20393)", () => {
    createDashboardWithNestedCard();

    editDashboard();

    setFilter("Time", "All Options");

    // map the date parameter to the card
    cy.findByTestId("dashcard-container").contains("Select").click();
    popover().contains("CREATED_AT").click();

    // save the dashboard
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    // open the sharing modal and enable sharing
    openNewPublicLinkDropdown("dashboard");

    // navigate to the public dashboard link
    cy.wait("@publicLink").then(({ response: { body } }) => {
      const { uuid } = body;

      cy.signOut();
      cy.visit(`/public/dashboard/${uuid}`);
    });

    // verify that the card is visible on the page
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    createQuestionAndDashboard({
      questionDetails: q1Details,
    }).then(({ body: { dashboard_id } }) => {
      createQuestion(q2Details);

      visitDashboard(dashboard_id);
      cy.findByTestId("scalar-value").should("have.text", "80.52");
      editDashboard();
    });
  });

  it("should respect dashboard card visualization (metabase#21559)", () => {
    cy.findByTestId("add-series-button").click({ force: true });

    cy.findByTestId("add-series-modal").within(() => {
      cy.findByText(q2Details.name).click();

      // wait for elements to appear inside modal
      chartPathWithFillColor("#A989C5").should("have.length", 1);
      chartPathWithFillColor("#88BF4D").should("have.length", 1);

      cy.button("Done").click();
    });

    cy.findByTestId("add-series-modal").should("not.exist");

    // Make sure visualization changed to bars
    getDashboardCard(0).within(() => {
      chartPathWithFillColor("#A989C5").should("have.length", 1);
      chartPathWithFillColor("#88BF4D").should("have.length", 1);
    });

    saveDashboard();
    // Wait for "Edited a few seconds ago" to disappear because the whole
    // dashboard re-renders after that!
    cy.findByTestId("revision-history-button").should("not.be.visible");

    openAndAddEmailsToSubscriptions([`${admin.first_name} ${admin.last_name}`]);

    sendEmailAndAssert(email => {
      expect(email.html).to.include("img"); // Bar chart is sent as img (inline attachment)
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
    restore();
    cy.signInAsAdmin();
  });

  it("update dashboard cards when changing parameters on publicly shared dashboards (metabase#22524)", () => {
    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.intercept("POST", `/api/dashboard/${dashboard_id}/public_link`).as(
          "publicLink",
        );
        visitDashboard(dashboard_id);
      },
    );

    editDashboard();
    setFilter("Text or Category", "Is");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    popover().contains("City").click();

    saveDashboard();

    // Share dashboard
    openNewPublicLinkDropdown("dashboard");

    cy.wait("@publicLink").then(({ response: { body } }) => {
      const { uuid } = body;

      cy.signOut();
      cy.visit(`/public/dashboard/${uuid}`);
    });

    // Set parameter value
    cy.findByPlaceholderText("Text").clear().type("Rye{enter}");

    // Check results
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2-7900 Cuerno Verde Road");
  });
});

describeEE("issue 24223", () => {
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

  const mapFiltersToCard = card_id => ({
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
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
    setupSMTP();
  });

  it("should clear default filter (metabase#24223)", () => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { card_id, dashboard_id } = dashboardCard;

        cy.editDashboardCard(dashboardCard, mapFiltersToCard(card_id));

        visitDashboard(dashboard_id);
        cy.location("search").should("eq", "?category=Doohickey&title=Awesome");
        cy.findByTestId("dashcard").should("contain", "36.37");
      },
    );

    openAndAddEmailsToSubscriptions([`${admin.first_name} ${admin.last_name}`]);
    cy.findByTestId("subscription-parameters-section").within(() => {
      cy.findAllByTestId("field-set-content")
        .filter(":contains(Doohickey)")
        .icon("close")
        .click();
    });

    sidebar().button("Done").click();

    cy.findByLabelText("Pulse Card")
      .should("contain", "Title is Awesome")
      .and("not.contain", "1 more filter")
      .click();

    sendEmailAndVisitIt();
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
    cy.findAllByTestId("column-header").last().should("have.text", ccName);
    cy.findAllByText("xavier").should("have.length", 2);

    filterWidget().click();
    cy.findByPlaceholderText("Enter some text").type("e").blur();
    cy.button("Add filter").click();

    cy.location("search").should("eq", `?${dashboardFilter.slug}=e`);
    cy.findAllByText("xavier").should("not.exist");
    cy.findAllByText("cameron.nitzsche").should("have.length", 2);
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
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
    cy.get("@dashboardId").then(id => {
      visitPublicDashboard(id);
    });

    assertOnResults();
  });

  it("signed embedding: dashboard text filter on a custom column should accept text input (metabase#25473-2)", () => {
    cy.get("@dashboardId").then(id => {
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

      visitEmbeddedPage(payload);
    });

    assertOnResults();
  });
});

describeEE("issue 26988", () => {
  beforeEach(() => {
    restore();
    cy.intercept("GET", "/api/preview_embed/dashboard/*").as(
      "previewDashboard",
    );

    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should apply embedding settings passed in URL on load", () => {
    cy.createQuestionAndDashboard({
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
      visitDashboard(card.dashboard_id);
    });

    openStaticEmbeddingModal({
      activeTab: "appearance",
      previewMode: "preview",
      acceptTerms: false,
    });

    cy.wait("@previewDashboard");
    getIframeBody().should("have.css", "font-family", "Lato, sans-serif");

    cy.findByLabelText("Playing with appearance options")
      .findByLabelText("Font")
      .as("font-control")
      .click();
    popover().findByText("Oswald").click();

    getIframeBody().should("have.css", "font-family", "Oswald, sans-serif");

    cy.get("@font-control").click();
    popover().findByText("Slabo 27px").click();

    getIframeBody().should(
      "have.css",
      "font-family",
      '"Slabo 27px", sans-serif',
    );
  });
});

describe("issue 30314", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();
  });

  it("should clean the new subscription form on cancel (metabase#30314)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);

    dashboardHeader().findByLabelText("subscriptions").click();
    sidebar().within(() => {
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
    restore();
    cy.signInAsAdmin();

    createSubscriptionWithoutRecipients();
  });

  it("frontend should gracefully handle the case of a subscription without a recipient (metabase#17657)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);

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

describe("issue 17658", { tags: "@external" }, () => {
  function moveDashboardToCollection(collectionName) {
    const { first_name, last_name, email } = admin;

    cy.request("GET", "/api/collection/tree?tree=true").then(
      ({ body: collections }) => {
        const { id } = collections.find(
          collection => collection.name === collectionName,
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
                  common_name: getFullName(admin),
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
    restore();
    cy.signInAsAdmin();

    setupSMTP();

    moveDashboardToCollection("First collection");
  });

  it("should delete dashboard subscription from any collection (metabase#17658)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);

    cy.icon("subscription").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Emailed monthly/).click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Delete this subscription").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

  function setUpAlert(questionId) {
    cy.request("POST", "/api/alert", {
      channels: [
        {
          schedule_type: "daily",
          schedule_hour: 12,
          channel_type: "slack",
          schedule_frame: null,
          recipients: [],
          details: { channel: "#work" },
          pulse_id: 1,
          id: 1,
          schedule_day: null,
          enabled: true,
        },
      ],
      alert_condition: "rows",
      name: null,
      creator_id: ADMIN_USER_ID,
      card: { id: questionId, include_csv: true, include_xls: false },
      alert_first_only: false,
      skip_if_empty: true,
      parameters: [],
      dashboard_id: null,
    }).then(({ body: { id: alertId } }) => {
      cy.intercept("PUT", `/api/alert/${alertId}`).as("alertQuery");
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id: questionId } }) => {
      setUpAlert(questionId);

      visitQuestion(questionId);
    });
  });

  it("editing an alert should not delete it (metabase#17547)", () => {
    cy.icon("bell").click();
    popover().within(() => {
      cy.findByText("Daily, 12:00 PM");
      cy.findByText("Edit").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("AM").click();
    cy.button("Save changes").click();

    cy.wait("@alertQuery");

    cy.icon("bell").click();
    popover().within(() => {
      cy.findByText("Daily, 12:00 AM");
    });
  });
});

describe("issue 16108", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display a tooltip for CTA icons on an individual question (metabase#16108)", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    cy.icon("download").realHover();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Download full results");
    cy.icon("bell").realHover();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Get alerts");
    cy.icon("share").realHover();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sharing");
  });
});
