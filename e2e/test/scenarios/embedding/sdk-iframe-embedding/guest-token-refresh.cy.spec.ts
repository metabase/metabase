import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion } from "e2e/support/helpers";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/embedding-sdk-helpers/constants";

const { H } = cy;
const { ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const PROVIDER_PATH = "/api/mock-guest-token-provider";
const PROVIDER_INTERCEPT = { method: "POST", pathname: PROVIDER_PATH } as const;

const HTTP_ERROR_MESSAGE =
  "Failed to fetch JWT token from /api/mock-guest-token-provider, status: 500.";
const WRONG_SHAPE_MESSAGE =
  /Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received {"token":/;

type Resource = { type: "dashboard" | "question"; id: number };
type TokenMode = "refresh-only" | "initial-token";

const COMPONENT_BY_TYPE = {
  dashboard: "metabase-dashboard",
  question: "metabase-question",
} as const;

function signJwt(
  resource: Resource,
  expirationSeconds: number,
): Cypress.Chainable<string> {
  return cy.then(() =>
    cy.task<string>("signJwt", {
      payload: {
        resource: { [resource.type]: resource.id },
        params: {},
        exp: Math.round(Date.now() / 1000) + expirationSeconds,
      },
      secret: JWT_SHARED_SECRET,
    }),
  );
}

function mockTokenProvider(
  alias: string,
  reply: { statusCode: number; body?: Record<string, unknown> },
) {
  cy.intercept(PROVIDER_INTERCEPT, (req) => {
    req.reply(reply);
  }).as(alias);
}

function loadGuestEmbed(
  resource: Resource,
  attributes: Record<string, unknown>,
) {
  H.loadSdkIframeEmbedTestPage({
    metabaseConfig: {
      isGuest: true,
      guestEmbedProviderUri: PROVIDER_PATH,
    },
    elements: [{ component: COMPONENT_BY_TYPE[resource.type], attributes }],
  });
}

function loadGuestEmbedForMode(resource: Resource, mode: TokenMode) {
  if (mode === "initial-token") {
    loadGuestEmbed(resource, { [`${resource.type}-id`]: resource.id });
    return;
  }

  signJwt(resource, -60).then((expiredToken) => {
    loadGuestEmbed(resource, { token: expiredToken });
  });
}

function forceTokenRefreshOnNextRequest() {
  cy.get("iframe[data-metabase-embed]")
    .its("0.contentWindow")
    .should("exist")
    .then((contentWindow) => {
      contentWindow.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS = true;
    });
}

function checkProviderErrors(resource: Resource, mode: TokenMode) {
  cy.log("the provider returns an HTTP error");
  mockTokenProvider("httpErrorProvider", { statusCode: 500 });
  loadGuestEmbedForMode(resource, mode);
  cy.wait("@httpErrorProvider");
  H.getSimpleEmbedIframeContent()
    .findByText(HTTP_ERROR_MESSAGE)
    .should("be.visible");

  cy.log("the provider returns a wrong response shape");
  signJwt(resource, 600).then((freshToken) => {
    mockTokenProvider("wrongShapeProvider", {
      statusCode: 200,
      body: { token: freshToken },
    });
  });
  loadGuestEmbedForMode(resource, mode);
  cy.wait("@wrongShapeProvider");
  H.getSimpleEmbedIframeContent()
    .findByText(WRONG_SHAPE_MESSAGE)
    .should("be.visible");
}

function loadWithShortLivedToken(resource: Resource, alias: string) {
  signJwt(resource, 5).then((shortLivedToken) => {
    signJwt(resource, 600).then((freshToken) => {
      mockTokenProvider(alias, {
        statusCode: 200,
        body: { jwt: freshToken },
      });
      loadGuestEmbed(resource, { token: shortLivedToken });
    });
  });
}

type FilterCheckOptions = {
  resource: Resource;
  columns: string[];
  waitForLoad: () => void;
};

function checkNumberFilterAfterRefresh({
  resource,
  columns,
  waitForLoad,
}: FilterCheckOptions) {
  cy.log("number filter after a token refresh");
  loadWithShortLivedToken(resource, "numberFilterProvider");

  H.getSimpleEmbedIframeContent().within(waitForLoad);

  forceTokenRefreshOnNextRequest();

  H.getSimpleEmbedIframeContent().within(() => {
    cy.findByLabelText("Price greater than").click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("50{enter}");
    });
    cy.log("ensure the token is refreshed after applying a filter value");
    cy.wait("@numberFilterProvider");

    H.assertTableData({
      columns,
      firstRows: [["2", "Small Marble Shoes", "70.08"]],
    });
  });
}

function checkCategoryFilterAfterRefresh({
  resource,
  columns,
  waitForLoad,
}: FilterCheckOptions) {
  cy.log("category filter after a token refresh");
  loadWithShortLivedToken(resource, "categoryFilterProvider");

  H.getSimpleEmbedIframeContent().within(waitForLoad);

  forceTokenRefreshOnNextRequest();

  H.getSimpleEmbedIframeContent().within(() => {
    cy.findByLabelText("Category").click();

    cy.log(
      "ensure the token is refreshed after the filter values endpoint is called",
    );
    cy.wait("@categoryFilterProvider");

    H.popover().within(() => {
      cy.findByRole("checkbox", { name: "Doohickey" }).click();
      cy.button("Add filter").click();
    });

    H.assertTableData({
      columns,
      firstRows: [["2", "Small Marble Shoes", "Doohickey"]],
    });
  });
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
            { type: "column", name: "ID" },
            { type: "column", name: "TITLE" },
            { type: "column", name: "PRICE" },
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
          cy.wrap(dashboard.id).as("priceDashboardId");

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
            { type: "column", name: "ID" },
            { type: "column", name: "TITLE" },
            { type: "column", name: "CATEGORY" },
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
          cy.wrap(dashboard.id).as("categoryDashboardId");

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

  // Takes no parameters, unlike the question the initial token names, so a token
  // swap between the two also changes which parameters are valid.
  function createOtherStandaloneQuestion() {
    createQuestion({
      name: "Products",
      enable_embedding: true,
      embedding_type: "guest-embed",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("otherQuestionId");
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
      cy.wrap(question.id).as("priceQuestionId");
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
      cy.wrap(question.id).as("categoryQuestionId");
    });
  }

  describe("dashboard", () => {
    beforeEach(() => {
      H.prepareGuestEmbedSdkIframeEmbedTest({
        onPrepare: () => {
          createDashboardWithQuestion();
          createDashboardWithPriceFilter();
          createDashboardWithCategoryFilter();
        },
      });
    });

    it("refresh-only: refreshes an expired token, shows provider errors, and keeps filters working after a refresh", () => {
      cy.get<number>("@dashboardId").then((dashboardId) => {
        const resource: Resource = { type: "dashboard", id: dashboardId };

        cy.log("the provider returns a fresh token");
        signJwt(resource, -60).then((expiredToken) => {
          signJwt(resource, 600).then((freshToken) => {
            mockTokenProvider("guestTokenProvider", {
              statusCode: 200,
              body: { jwt: freshToken },
            });

            loadGuestEmbed(resource, {
              token: expiredToken,
              "custom-context": '{"param":"value","nested":{"a":1}}',
            });
          });
        });

        cy.wait("@guestTokenProvider").then((interception) => {
          expect(interception.request.body).to.deep.include({
            entityType: "dashboard",
            entityId: dashboardId,
            customContext: { param: "value", nested: { a: 1 } },
          });
        });

        H.getSimpleEmbedIframeContent().should("contain", "Orders");

        checkProviderErrors(resource, "refresh-only");
      });

      cy.get<number>("@priceDashboardId").then((priceDashboardId) => {
        checkNumberFilterAfterRefresh({
          resource: { type: "dashboard", id: priceDashboardId },
          columns: ["ID", "Title", "Price"],
          waitForLoad: () => {
            cy.findByLabelText("Price greater than").should("be.visible");
          },
        });
      });

      cy.get<number>("@categoryDashboardId").then((categoryDashboardId) => {
        checkCategoryFilterAfterRefresh({
          resource: { type: "dashboard", id: categoryDashboardId },
          columns: ["ID", "Title", "Category"],
          waitForLoad: () => {
            cy.findByLabelText("Category").should("be.visible");
          },
        });
      });
    });

    it("initial-token: fetches the first token and shows provider errors", () => {
      cy.get<number>("@dashboardId").then((dashboardId) => {
        const resource: Resource = { type: "dashboard", id: dashboardId };

        cy.log("the provider returns a fresh token");
        signJwt(resource, 600).then((freshToken) => {
          mockTokenProvider("guestTokenProvider", {
            statusCode: 200,
            body: { jwt: freshToken },
          });
        });

        loadGuestEmbed(resource, {
          "dashboard-id": dashboardId,
          "custom-context": "test-custom-context",
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

        checkProviderErrors(resource, "initial-token");
      });
    });
  });

  describe("question", () => {
    beforeEach(() => {
      H.prepareGuestEmbedSdkIframeEmbedTest({
        onPrepare: () => {
          createStandaloneQuestion();
          createOtherStandaloneQuestion();
          createQuestionWithPriceFilter();
          createQuestionWithCategoryFilter();
        },
      });
    });

    it("refresh-only: refreshes an expired token, shows provider errors, and keeps filters working after a refresh", () => {
      cy.get<number>("@questionId").then((questionId) => {
        const resource: Resource = { type: "question", id: questionId };

        cy.log("the provider returns a fresh token");
        signJwt(resource, -60).then((expiredToken) => {
          signJwt(resource, 600).then((freshToken) => {
            mockTokenProvider("guestTokenProvider", {
              statusCode: 200,
              body: { jwt: freshToken },
            });

            loadGuestEmbed(resource, {
              token: expiredToken,
              "custom-context": "test-custom-context",
            });
          });
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

        checkProviderErrors(resource, "refresh-only");
      });

      cy.get<number>("@priceQuestionId").then((priceQuestionId) => {
        checkNumberFilterAfterRefresh({
          resource: { type: "question", id: priceQuestionId },
          columns: ["ID", "TITLE", "PRICE"],
          waitForLoad: () => {
            cy.findByText("Products with price filter").should("be.visible");
          },
        });
      });

      cy.get<number>("@categoryQuestionId").then((categoryQuestionId) => {
        checkCategoryFilterAfterRefresh({
          resource: { type: "question", id: categoryQuestionId },
          columns: ["ID", "TITLE", "CATEGORY"],
          waitForLoad: () => {
            cy.findByText("Products with category filter").should("be.visible");
          },
        });
      });
    });

    it("refresh-only: switches to the question the refreshed token names", () => {
      cy.get<number>("@categoryQuestionId").then((categoryQuestionId) => {
        cy.get<number>("@otherQuestionId").then((otherQuestionId) => {
          const resource: Resource = {
            type: "question",
            id: categoryQuestionId,
          };

          signJwt(resource, 600).then((initialToken) => {
            signJwt({ type: "question", id: otherQuestionId }, 600).then(
              (freshToken) => {
                mockTokenProvider("guestTokenProvider", {
                  statusCode: 200,
                  body: { jwt: freshToken },
                });

                loadGuestEmbed(resource, { token: initialToken });
              },
            );
          });

          // Apply a filter value so the question runs with a parameter
          // set, which is the state that has to survive the swap.
          H.getSimpleEmbedIframeContent().within(() => {
            cy.findByLabelText("Category").click();
            H.popover().within(() => {
              cy.findByRole("checkbox", { name: "Doohickey" }).click();
              cy.button("Add filter").click();
            });

            H.assertTableData({
              columns: ["ID", "TITLE", "CATEGORY"],
            });
          });

          forceTokenRefreshOnNextRequest();

          H.getSimpleEmbedIframeContent().within(() => {
            // The refresh only fires on the next request, so re-running
            // the query with a new filter value is what triggers it.
            cy.findByLabelText("Category").click();
            H.popover().within(() => {
              cy.findByRole("checkbox", { name: "Gadget" }).click();
              cy.button("Update filter").click();
            });

            cy.wait("@guestTokenProvider");
          });

          // The refreshed token names a question that takes no
          // parameters, so the old filter value must not be sent along
          // with it.
          H.getSimpleEmbedIframeContent()
            .findByText(/Unknown parameter/)
            .should("not.exist");

          // "Vendor" is only on the question the refreshed token names.
          H.getSimpleEmbedIframeContent().findByText("Vendor").should("exist");
        });
      });
    });

    it("initial-token: fetches the first token and shows provider errors", () => {
      cy.get<number>("@questionId").then((questionId) => {
        const resource: Resource = { type: "question", id: questionId };

        cy.log("the provider returns a fresh token");
        signJwt(resource, 600).then((freshToken) => {
          mockTokenProvider("guestTokenProvider", {
            statusCode: 200,
            body: { jwt: freshToken },
          });
        });

        loadGuestEmbed(resource, {
          "question-id": questionId,
          "custom-context": "test-custom-context",
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

        checkProviderErrors(resource, "initial-token");
      });
    });
  });
});
