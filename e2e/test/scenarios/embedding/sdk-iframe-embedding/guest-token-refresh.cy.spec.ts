import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/embedding-sdk-helpers/constants";

const { H } = cy;
const { ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const PROVIDER_PATH = "/api/mock-guest-token-provider";
const PROVIDER_INTERCEPT = { method: "POST", pathname: PROVIDER_PATH } as const;

type SignJwtParams = (
  | { dashboardId: number; questionId?: never }
  | { questionId: number; dashboardId?: never }
) & { expirationSeconds: number; params?: Record<string, unknown> };

function signJwt({
  dashboardId,
  questionId,
  expirationSeconds,
  params = {},
}: SignJwtParams): Cypress.Chainable<string> {
  const resource =
    dashboardId !== undefined
      ? { dashboard: dashboardId }
      : { question: questionId };

  return cy
    .task<string>("signJwt", {
      payload: {
        resource,
        params,
        exp: Math.round(Date.now() / 1000) + expirationSeconds,
      },
      secret: JWT_SHARED_SECRET,
    })
    .then((token) => token);
}

const PRICE_DASHBOARD_PARAMETER = {
  name: "Price greater than",
  slug: "price",
  id: "aaaaaaaa",
  type: "number/>=",
  sectionId: "number",
};

const CATEGORY_DASHBOARD_PARAMETER = {
  name: "Category",
  slug: "category",
  id: "bbbbbbbb",
  type: "string/=",
  sectionId: "string",
};

describe("scenarios > embedding > sdk iframe embedding > guest token refresh", () => {
  function createDashboardWithQuestion() {
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Orders",
        query: { "source-table": ORDERS_ID },
      },
      dashboardDetails: {
        name: "Guest Token Refresh Dashboard",
        enable_embedding: true,
        embedding_type: "guest-embed",
      },
      cardDetails: { row: 0, col: 0, size_x: 11, size_y: 6 },
    }).then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");
    });
  }

  function createDashboardWithPriceFilter() {
    H.createTestQuery({
      database: SAMPLE_DB_ID,
      stages: [
        {
          source: { type: "table", id: PRODUCTS_ID },
          fields: [
            { type: "column", name: "ID", sourceName: "PRODUCTS" },
            { type: "column", name: "TITLE", sourceName: "PRODUCTS" },
            { type: "column", name: "PRICE", sourceName: "PRODUCTS" },
          ],
          limit: 10,
        },
      ],
    }).then((datasetQuery) => {
      H.createCard({
        dataset_query: datasetQuery,
        name: "Products with price filter",
      }).then((question) => {
        cy.request("POST", "/api/dashboard", {
          name: "Guest Token Refresh Dashboard with Price Filter",
          parameters: [PRICE_DASHBOARD_PARAMETER],
        }).then(({ body: dashboard }) => {
          cy.wrap(dashboard.id).as("dashboardId");

          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            enable_embedding: true,
            embedding_type: "guest-embed",
            embedding_params: { price: "enabled" },
            dashcards: [
              {
                id: -1,
                card_id: question.id,
                row: 0,
                col: 0,
                size_x: 24,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: "aaaaaaaa",
                    card_id: question.id,
                    target: ["dimension", ["field", PRODUCTS.PRICE, null]],
                  },
                ],
              },
            ],
          });
        });
      });
    });
  }

  function createDashboardWithCategoryFilter() {
    H.createTestQuery({
      database: SAMPLE_DB_ID,
      stages: [
        {
          source: { type: "table", id: PRODUCTS_ID },
          fields: [
            { type: "column", name: "ID", sourceName: "PRODUCTS" },
            { type: "column", name: "TITLE", sourceName: "PRODUCTS" },
            { type: "column", name: "CATEGORY", sourceName: "PRODUCTS" },
          ],
          limit: 10,
        },
      ],
    }).then((datasetQuery) => {
      H.createCard({
        dataset_query: datasetQuery,
        name: "Products with category filter",
      }).then((question) => {
        cy.request("POST", "/api/dashboard", {
          name: "Guest Token Refresh Dashboard with Category Filter",
          parameters: [CATEGORY_DASHBOARD_PARAMETER],
        }).then(({ body: dashboard }) => {
          cy.wrap(dashboard.id).as("dashboardId");

          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            enable_embedding: true,
            embedding_type: "guest-embed",
            embedding_params: { category: "enabled" },
            dashcards: [
              {
                id: -1,
                card_id: question.id,
                row: 0,
                col: 0,
                size_x: 24,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: "bbbbbbbb",
                    card_id: question.id,
                    target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                  },
                ],
              },
            ],
          });
        });
      });
    });
  }

  function createStandaloneQuestion() {
    createQuestion({
      name: "Orders",
      enable_embedding: true,
      embedding_type: "guest-embed",
      query: { "source-table": ORDERS_ID },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });
  }

  function createQuestionWithPriceFilter() {
    H.createNativeQuestion({
      name: "Products with price filter",
      native: {
        query: "SELECT ID, TITLE, PRICE FROM PRODUCTS WHERE {{price}} LIMIT 10",
        "template-tags": {
          price: {
            id: "cccccccc",
            name: "price",
            "display-name": "Price greater than",
            type: "dimension",
            dimension: ["field", PRODUCTS.PRICE, null],
            "widget-type": "number/>=",
            required: false,
          },
        },
      },
      enable_embedding: true,
      embedding_params: { price: "enabled" },
      embedding_type: "guest-embed",
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });
  }

  function createQuestionWithCategoryFilter() {
    H.createNativeQuestion({
      name: "Products with category filter",
      native: {
        query:
          "SELECT ID, TITLE, CATEGORY FROM PRODUCTS WHERE {{category}} LIMIT 10",
        "template-tags": {
          category: {
            id: "dddddddd",
            name: "category",
            "display-name": "Category",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "category",
            required: false,
          },
        },
      },
      enable_embedding: true,
      embedding_params: { category: "enabled" },
      embedding_type: "guest-embed",
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });
  }

  describe("dashboard refresh-only", () => {
    describe("happy path", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createDashboardWithQuestion,
        });
      });

      it("calls guestEmbedProviderUri with { entityType, entityId } and loads dashboard after token refresh", () => {
        cy.get<number>("@dashboardId").then((dashboardId) => {
          signJwt({ dashboardId, expirationSeconds: -60 }).then(
            (expiredToken) => {
              signJwt({ dashboardId, expirationSeconds: 600 }).then(
                (freshToken) => {
                  cy.intercept(PROVIDER_INTERCEPT, (req) => {
                    req.reply({ statusCode: 200, body: { jwt: freshToken } });
                  }).as("guestTokenProvider");

                  H.loadSdkIframeEmbedTestPage({
                    metabaseConfig: {
                      isGuest: true,
                      guestEmbedProviderUri: PROVIDER_PATH,
                    },
                    elements: [
                      {
                        component: "metabase-dashboard",
                        attributes: {
                          token: expiredToken,
                          "custom-context":
                            '{"param":"value","nested":{"a":1}}',
                        },
                      },
                    ],
                  });

                  cy.wait("@guestTokenProvider").then((interception) => {
                    expect(interception.request.body).to.deep.include({
                      entityType: "dashboard",
                      entityId: dashboardId,
                      customContext: { param: "value", nested: { a: 1 } },
                    });
                  });

                  H.getSimpleEmbedIframeContent().should("contain", "Orders");
                },
              );
            },
          );
        });
      });
    });

    describe("provider error shows error state", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createDashboardWithQuestion,
        });
      });

      it("shows an error when the provider returns an HTTP error", () => {
        cy.get<number>("@dashboardId").then((dashboardId) => {
          signJwt({ dashboardId, expirationSeconds: -60 }).then(
            (expiredToken) => {
              cy.intercept(PROVIDER_INTERCEPT, (req) => {
                req.reply({ statusCode: 500 });
              }).as("guestTokenProvider");

              H.loadSdkIframeEmbedTestPage({
                metabaseConfig: {
                  isGuest: true,
                  guestEmbedProviderUri: PROVIDER_PATH,
                },
                elements: [
                  {
                    component: "metabase-dashboard",
                    attributes: { token: expiredToken },
                  },
                ],
              });

              cy.wait("@guestTokenProvider");
              H.getSimpleEmbedIframeContent()
                .findByText(
                  "Failed to fetch JWT token from /api/mock-guest-token-provider, status: 500.",
                )
                .should("be.visible");
            },
          );
        });
      });

      it("shows an error when the provider returns a wrong response shape", () => {
        cy.get<number>("@dashboardId").then((dashboardId) => {
          signJwt({ dashboardId, expirationSeconds: -60 }).then(
            (expiredToken) => {
              signJwt({ dashboardId, expirationSeconds: 600 }).then(
                (freshToken) => {
                  cy.intercept(PROVIDER_INTERCEPT, (req) => {
                    req.reply({
                      statusCode: 200,
                      body: { token: freshToken },
                    });
                  }).as("guestTokenProvider");

                  H.loadSdkIframeEmbedTestPage({
                    metabaseConfig: {
                      isGuest: true,
                      guestEmbedProviderUri: PROVIDER_PATH,
                    },
                    elements: [
                      {
                        component: "metabase-dashboard",
                        attributes: { token: expiredToken },
                      },
                    ],
                  });

                  cy.wait("@guestTokenProvider");
                  H.getSimpleEmbedIframeContent()
                    .findByText(
                      /Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received {"token":/,
                    )
                    .should("be.visible");
                },
              );
            },
          );
        });
      });
    });

    describe("number filter interaction after token refresh", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createDashboardWithPriceFilter,
        });
      });

      it("applying a number filter after token refresh returns filtered results", () => {
        cy.get<number>("@dashboardId").then((dashboardId) => {
          signJwt({ dashboardId, expirationSeconds: 5 }).then(
            (shortLivedToken) => {
              signJwt({ dashboardId, expirationSeconds: 600 }).then(
                (freshToken) => {
                  cy.intercept(PROVIDER_INTERCEPT, (req) => {
                    req.reply({ statusCode: 200, body: { jwt: freshToken } });
                  }).as("guestTokenProvider");

                  H.loadSdkIframeEmbedTestPage({
                    metabaseConfig: {
                      isGuest: true,
                      guestEmbedProviderUri: PROVIDER_PATH,
                    },
                    elements: [
                      {
                        component: "metabase-dashboard",
                        attributes: { token: shortLivedToken },
                      },
                    ],
                  });

                  H.getSimpleEmbedIframeContent().within(() => {
                    cy.findByLabelText("Price greater than").should(
                      "be.visible",
                    );
                  });

                  cy.get("iframe[data-metabase-embed]")
                    .its("0.contentWindow")
                    .should("exist")
                    .then((contentWindow) => {
                      contentWindow.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS = true;
                    });

                  H.getSimpleEmbedIframeContent().within(() => {
                    cy.findByLabelText("Price greater than").click();
                    H.popover().within(() => {
                      cy.findByPlaceholderText("Enter a number").type(
                        "50{enter}",
                      );
                    });
                    cy.log(
                      "ensure the token is refreshed after applying a filter value",
                    );
                    cy.wait("@guestTokenProvider");

                    H.assertTableData({
                      columns: ["ID", "Title", "Price"],
                      firstRows: [["2", "Small Marble Shoes", "70.08"]],
                    });
                  });
                },
              );
            },
          );
        });
      });
    });

    describe("category filter interaction after token refresh", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createDashboardWithCategoryFilter,
        });
      });

      it("applying a category filter after token refresh returns filtered results", () => {
        cy.get<number>("@dashboardId").then((dashboardId) => {
          signJwt({ dashboardId, expirationSeconds: 5 }).then(
            (shortLivedToken) => {
              signJwt({ dashboardId, expirationSeconds: 600 }).then(
                (freshToken) => {
                  cy.intercept(PROVIDER_INTERCEPT, (req) => {
                    req.reply({ statusCode: 200, body: { jwt: freshToken } });
                  }).as("guestTokenProvider");

                  H.loadSdkIframeEmbedTestPage({
                    metabaseConfig: {
                      isGuest: true,
                      guestEmbedProviderUri: PROVIDER_PATH,
                    },
                    elements: [
                      {
                        component: "metabase-dashboard",
                        attributes: { token: shortLivedToken },
                      },
                    ],
                  });

                  H.getSimpleEmbedIframeContent().within(() => {
                    cy.findByLabelText("Category").should("be.visible");
                  });

                  cy.get("iframe[data-metabase-embed]")
                    .its("0.contentWindow")
                    .should("exist")
                    .then((contentWindow) => {
                      contentWindow.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS = true;
                    });

                  H.getSimpleEmbedIframeContent().within(() => {
                    cy.findByLabelText("Category").click();

                    cy.log(
                      "ensure the token is refreshed after the filter values endpoint is called",
                    );
                    cy.wait("@guestTokenProvider");

                    H.popover().within(() => {
                      cy.findByRole("checkbox", {
                        name: "Doohickey",
                      }).click();
                      cy.button("Add filter").click();
                    });

                    H.assertTableData({
                      columns: ["ID", "Title", "Category"],
                      firstRows: [["2", "Small Marble Shoes", "Doohickey"]],
                    });
                  });
                },
              );
            },
          );
        });
      });
    });
  });

  describe("dashboard initial-token", () => {
    describe("happy path", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createDashboardWithQuestion,
        });
      });

      it("calls guestEmbedProviderUri with { entityType, entityId } and loads dashboard (initial token fetch)", () => {
        cy.get<number>("@dashboardId").then((dashboardId) => {
          signJwt({ dashboardId, expirationSeconds: 600 }).then(
            (freshToken) => {
              cy.intercept(PROVIDER_INTERCEPT, (req) => {
                req.reply({ statusCode: 200, body: { jwt: freshToken } });
              }).as("guestTokenProvider");

              H.loadSdkIframeEmbedTestPage({
                metabaseConfig: {
                  isGuest: true,
                  guestEmbedProviderUri: PROVIDER_PATH,
                },
                elements: [
                  {
                    component: "metabase-dashboard",
                    attributes: {
                      "dashboard-id": dashboardId,
                      "custom-context": "test-custom-context",
                    },
                  },
                ],
              });

              cy.wait("@guestTokenProvider").then((interception) => {
                expect(interception.request.url).to.include("response=json");
                expect(interception.request.body).to.deep.include({
                  entityType: "dashboard",
                  entityId: dashboardId,
                  customContext: "test-custom-context",
                });
              });

              H.getSimpleEmbedIframeContent().should("contain", "Orders");
            },
          );
        });
      });
    });

    describe("provider error shows error state", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createDashboardWithQuestion,
        });
      });

      it("shows an error when the provider returns an HTTP error", () => {
        cy.get<number>("@dashboardId").then((dashboardId) => {
          cy.intercept(PROVIDER_INTERCEPT, (req) => {
            req.reply({ statusCode: 500 });
          }).as("guestTokenProvider");

          H.loadSdkIframeEmbedTestPage({
            metabaseConfig: {
              isGuest: true,
              guestEmbedProviderUri: PROVIDER_PATH,
            },
            elements: [
              {
                component: "metabase-dashboard",
                attributes: { "dashboard-id": dashboardId },
              },
            ],
          });

          cy.wait("@guestTokenProvider");
          H.getSimpleEmbedIframeContent()
            .findByText(
              "Failed to fetch JWT token from /api/mock-guest-token-provider, status: 500.",
            )
            .should("be.visible");
        });
      });

      it("shows an error when the provider returns a wrong response shape", () => {
        cy.get<number>("@dashboardId").then((dashboardId) => {
          signJwt({ dashboardId, expirationSeconds: 600 }).then(
            (freshToken) => {
              cy.intercept(PROVIDER_INTERCEPT, (req) => {
                req.reply({
                  statusCode: 200,
                  body: { token: freshToken },
                });
              }).as("guestTokenProvider");

              H.loadSdkIframeEmbedTestPage({
                metabaseConfig: {
                  isGuest: true,
                  guestEmbedProviderUri: PROVIDER_PATH,
                },
                elements: [
                  {
                    component: "metabase-dashboard",
                    attributes: { "dashboard-id": dashboardId },
                  },
                ],
              });

              cy.wait("@guestTokenProvider");
              H.getSimpleEmbedIframeContent()
                .findByText(
                  /Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received {"token":/,
                )
                .should("be.visible");
            },
          );
        });
      });
    });
  });

  describe("question refresh-only", () => {
    describe("happy path", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createStandaloneQuestion,
        });
      });

      it("calls guestEmbedProviderUri with { entityType: question, entityId } and loads question after token refresh", () => {
        cy.get<number>("@questionId").then((questionId) => {
          signJwt({ questionId, expirationSeconds: -60 }).then(
            (expiredToken) => {
              signJwt({ questionId, expirationSeconds: 600 }).then(
                (freshToken) => {
                  cy.intercept(PROVIDER_INTERCEPT, (req) => {
                    req.reply({ statusCode: 200, body: { jwt: freshToken } });
                  }).as("guestTokenProvider");

                  H.loadSdkIframeEmbedTestPage({
                    metabaseConfig: {
                      isGuest: true,
                      guestEmbedProviderUri: PROVIDER_PATH,
                    },
                    elements: [
                      {
                        component: "metabase-question",
                        attributes: {
                          token: expiredToken,
                          "custom-context": "test-custom-context",
                        },
                      },
                    ],
                  });

                  cy.wait("@guestTokenProvider").then((interception) => {
                    expect(interception.request.body).to.deep.include({
                      entityType: "question",
                      entityId: questionId,
                      customContext: "test-custom-context",
                    });
                  });

                  H.getSimpleEmbedIframeContent()
                    .findByTestId("visualization-root")
                    .should("exist");
                },
              );
            },
          );
        });
      });
    });

    describe("provider error shows error state", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createStandaloneQuestion,
        });
      });

      it("shows an error when the provider returns an HTTP error", () => {
        cy.get<number>("@questionId").then((questionId) => {
          signJwt({ questionId, expirationSeconds: -60 }).then(
            (expiredToken) => {
              cy.intercept(PROVIDER_INTERCEPT, (req) => {
                req.reply({ statusCode: 500 });
              }).as("guestTokenProvider");

              H.loadSdkIframeEmbedTestPage({
                metabaseConfig: {
                  isGuest: true,
                  guestEmbedProviderUri: PROVIDER_PATH,
                },
                elements: [
                  {
                    component: "metabase-question",
                    attributes: { token: expiredToken },
                  },
                ],
              });

              cy.wait("@guestTokenProvider");
              H.getSimpleEmbedIframeContent()
                .findByText(
                  "Failed to fetch JWT token from /api/mock-guest-token-provider, status: 500.",
                )
                .should("be.visible");
            },
          );
        });
      });

      it("shows an error when the provider returns a wrong response shape", () => {
        cy.get<number>("@questionId").then((questionId) => {
          signJwt({ questionId, expirationSeconds: -60 }).then(
            (expiredToken) => {
              signJwt({ questionId, expirationSeconds: 600 }).then(
                (freshToken) => {
                  cy.intercept(PROVIDER_INTERCEPT, (req) => {
                    req.reply({
                      statusCode: 200,
                      body: { token: freshToken },
                    });
                  }).as("guestTokenProvider");

                  H.loadSdkIframeEmbedTestPage({
                    metabaseConfig: {
                      isGuest: true,
                      guestEmbedProviderUri: PROVIDER_PATH,
                    },
                    elements: [
                      {
                        component: "metabase-question",
                        attributes: { token: expiredToken },
                      },
                    ],
                  });

                  cy.wait("@guestTokenProvider");
                  H.getSimpleEmbedIframeContent()
                    .findByText(
                      /Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received {"token":/,
                    )
                    .should("be.visible");
                },
              );
            },
          );
        });
      });
    });

    describe("number filter interaction after token refresh", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createQuestionWithPriceFilter,
        });
      });

      it("applying a number filter after token refresh returns filtered results", () => {
        cy.get<number>("@questionId").then((questionId) => {
          signJwt({ questionId, expirationSeconds: 5 }).then(
            (shortLivedToken) => {
              signJwt({ questionId, expirationSeconds: 600 }).then(
                (freshToken) => {
                  cy.intercept(PROVIDER_INTERCEPT, (req) => {
                    req.reply({ statusCode: 200, body: { jwt: freshToken } });
                  }).as("guestTokenProvider");

                  H.loadSdkIframeEmbedTestPage({
                    metabaseConfig: {
                      isGuest: true,
                      guestEmbedProviderUri: PROVIDER_PATH,
                    },
                    elements: [
                      {
                        component: "metabase-question",
                        attributes: { token: shortLivedToken },
                      },
                    ],
                  });

                  H.getSimpleEmbedIframeContent().within(() => {
                    cy.findByText("Products with price filter").should(
                      "be.visible",
                    );
                  });

                  cy.get("iframe[data-metabase-embed]")
                    .its("0.contentWindow")
                    .should("exist")
                    .then((contentWindow) => {
                      contentWindow.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS = true;
                    });

                  H.getSimpleEmbedIframeContent().within(() => {
                    cy.findByLabelText("Price greater than").click();
                    H.popover().within(() => {
                      cy.findByPlaceholderText("Enter a number").type(
                        "50{enter}",
                      );
                    });
                    cy.log(
                      "ensure the token is refreshed after applying a filter value",
                    );
                    cy.wait("@guestTokenProvider");

                    H.assertTableData({
                      columns: ["ID", "TITLE", "PRICE"],
                      firstRows: [["2", "Small Marble Shoes", "70.08"]],
                    });
                  });
                },
              );
            },
          );
        });
      });
    });

    describe("category filter interaction after token refresh", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createQuestionWithCategoryFilter,
        });
      });

      it("applying a category filter after token refresh returns filtered results", () => {
        cy.get<number>("@questionId").then((questionId) => {
          signJwt({ questionId, expirationSeconds: 5 }).then(
            (shortLivedToken) => {
              signJwt({ questionId, expirationSeconds: 600 }).then(
                (freshToken) => {
                  cy.intercept(PROVIDER_INTERCEPT, (req) => {
                    req.reply({ statusCode: 200, body: { jwt: freshToken } });
                  }).as("guestTokenProvider");

                  H.loadSdkIframeEmbedTestPage({
                    metabaseConfig: {
                      isGuest: true,
                      guestEmbedProviderUri: PROVIDER_PATH,
                    },
                    elements: [
                      {
                        component: "metabase-question",
                        attributes: { token: shortLivedToken },
                      },
                    ],
                  });

                  H.getSimpleEmbedIframeContent().within(() => {
                    cy.findByText("Products with category filter").should(
                      "be.visible",
                    );
                  });

                  cy.get("iframe[data-metabase-embed]")
                    .its("0.contentWindow")
                    .should("exist")
                    .then((contentWindow) => {
                      contentWindow.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS = true;
                    });

                  H.getSimpleEmbedIframeContent().within(() => {
                    cy.findByLabelText("Category").click();

                    cy.log(
                      "ensure the token is refreshed after the filter values endpoint is called",
                    );
                    cy.wait("@guestTokenProvider");

                    H.popover().within(() => {
                      cy.findByRole("checkbox", {
                        name: "Doohickey",
                      }).click();
                      cy.button("Add filter").click();
                    });

                    H.assertTableData({
                      columns: ["ID", "TITLE", "CATEGORY"],
                      firstRows: [["2", "Small Marble Shoes", "Doohickey"]],
                    });
                  });
                },
              );
            },
          );
        });
      });
    });
  });

  describe("question initial-token", () => {
    describe("happy path", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createStandaloneQuestion,
        });
      });

      it("calls guestEmbedProviderUri with { entityType: question, entityId } and loads question (initial token fetch)", () => {
        cy.get<number>("@questionId").then((questionId) => {
          signJwt({ questionId, expirationSeconds: 600 }).then((freshToken) => {
            cy.intercept(PROVIDER_INTERCEPT, (req) => {
              req.reply({ statusCode: 200, body: { jwt: freshToken } });
            }).as("guestTokenProvider");

            H.loadSdkIframeEmbedTestPage({
              metabaseConfig: {
                isGuest: true,
                guestEmbedProviderUri: PROVIDER_PATH,
              },
              elements: [
                {
                  component: "metabase-question",
                  attributes: {
                    "question-id": questionId,
                    "custom-context": "test-custom-context",
                  },
                },
              ],
            });

            cy.wait("@guestTokenProvider").then((interception) => {
              expect(interception.request.url).to.include("response=json");
              expect(interception.request.body).to.deep.include({
                entityType: "question",
                entityId: questionId,
                customContext: "test-custom-context",
              });
            });

            H.getSimpleEmbedIframeContent()
              .findByTestId("visualization-root")
              .should("exist");
          });
        });
      });
    });

    describe("provider error shows error state", () => {
      beforeEach(() => {
        H.prepareGuestEmbedSdkIframeEmbedTest({
          onPrepare: createStandaloneQuestion,
        });
      });

      it("shows an error when the provider returns an HTTP error", () => {
        cy.get<number>("@questionId").then((questionId) => {
          cy.intercept(PROVIDER_INTERCEPT, (req) => {
            req.reply({ statusCode: 500 });
          }).as("guestTokenProvider");

          H.loadSdkIframeEmbedTestPage({
            metabaseConfig: {
              isGuest: true,
              guestEmbedProviderUri: PROVIDER_PATH,
            },
            elements: [
              {
                component: "metabase-question",
                attributes: { "question-id": questionId },
              },
            ],
          });

          cy.wait("@guestTokenProvider");
          H.getSimpleEmbedIframeContent()
            .findByText(
              "Failed to fetch JWT token from /api/mock-guest-token-provider, status: 500.",
            )
            .should("be.visible");
        });
      });

      it("shows an error when the provider returns a wrong response shape", () => {
        cy.get<number>("@questionId").then((questionId) => {
          signJwt({ questionId, expirationSeconds: 600 }).then((freshToken) => {
            cy.intercept(PROVIDER_INTERCEPT, (req) => {
              req.reply({
                statusCode: 200,
                body: { token: freshToken },
              });
            }).as("guestTokenProvider");

            H.loadSdkIframeEmbedTestPage({
              metabaseConfig: {
                isGuest: true,
                guestEmbedProviderUri: PROVIDER_PATH,
              },
              elements: [
                {
                  component: "metabase-question",
                  attributes: { "question-id": questionId },
                },
              ],
            });

            cy.wait("@guestTokenProvider");
            H.getSimpleEmbedIframeContent()
              .findByText(
                /Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received {"token":/,
              )
              .should("be.visible");
          });
        });
      });
    });
  });
});
