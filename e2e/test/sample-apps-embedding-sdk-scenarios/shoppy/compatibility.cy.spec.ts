const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  createCollection,
} from "e2e/support/helpers";
import {
  createInjectedEntityIdGetter,
  getSdkRoot,
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdkForE2e,
} from "e2e/support/helpers/e2e-embedding-sdk-helpers";

const TIMEOUT = 30000;

const QUESTION: StructuredQuestionDetails = {
  display: "table",
  query: { "source-table": SAMPLE_DATABASE.ACCOUNTS_ID },
  visualization_settings: {},
} as const;

describe("Embedding SDK: shoppy compatibility", () => {
  const injectEntityIds = ({
    collectionId,
    dashboardId,
    questionId,
  }: {
    collectionId?: number | string;
    dashboardId?: number | string;
    questionId?: number;
  }) =>
    createInjectedEntityIdGetter(({ entityType }) => {
      switch (entityType) {
        case "collection":
          return collectionId;
        case "dashboard":
          return dashboardId;
        case "question":
          return questionId;
        default:
          return 1;
      }
    });

  beforeEach(() => {
    H.restore();

    signInAsAdminAndEnableEmbeddingSdkForE2e();
    mockAuthProviderAndJwtSignIn();

    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
  });

  const categories: any[] = [
    {
      id: 1,
      name: "Category 1",
      description: "Category 1 description",
    },
  ];
  const products: any[] = [
    {
      id: 1,
      title: "Product 1",
      imageUrl: null,
      category: { id: 1, name: "Category 1" },
      shopId: 4,
    },
  ];

  it("should open an Interactive Dashboard", () => {
    H.createQuestionAndDashboard({
      questionDetails: QUESTION,
    }).then(({ body: { id: questionId, dashboard_id: dashboardId } }) => {
      cy.on(
        "window:before:load",
        injectEntityIds({
          dashboardId,
          questionId,
        }),
      );

      cy.visit({
        url: "http://localhost:4303/admin/analytics/1",
      });
    });

    H.main().within(() => {
      cy.findByTestId("visualization-root", { timeout: TIMEOUT });

      expect(cy.findByText("kub.macy@gmail.example").should("exist"));
    });
  });

  it("should open products list", () => {
    H.createQuestion(QUESTION).then(({ body: { id } }) => {
      cy.on(
        "window:before:load",
        injectEntityIds({
          questionId: id,
        }),
      );

      cy.intercept("GET", "/categories*", req => {
        req.continue(res => {
          res.body = JSON.stringify({ categories });
        });
      });
      cy.intercept("GET", "/products*", req => {
        req.continue(res => {
          res.body = JSON.stringify({ products });
        });
      });

      cy.visit({
        url: "http://localhost:4303/admin/products",
      });
    });

    H.main().within(() => {
      cy.findByTestId("visualization-root", { timeout: TIMEOUT });

      expect(cy.findByText("kub.macy@gmail.example").should("exist"));
    });
  });

  it("should open a product", () => {
    H.createQuestion(QUESTION).then(({ body: { id } }) => {
      cy.on(
        "window:before:load",
        injectEntityIds({
          questionId: id,
        }),
      );

      cy.intercept("GET", "/categories*", req => {
        req.continue(res => {
          res.body = JSON.stringify({ categories });
        });
      });
      cy.intercept("GET", "/product/*", req => {
        req.continue(res => {
          res.body = JSON.stringify({ product: products[0] });
        });
      });

      cy.visit({
        url: "http://localhost:4303/admin/products/1",
      });
    });

    H.main().within(() => {
      cy.findAllByTestId("visualization-root", { timeout: TIMEOUT });

      expect(cy.findAllByText("kub.macy@gmail.example").should("exist"));
    });
  });

  it("should open a new from scratch page", () => {
    H.createQuestion(QUESTION).then(({ body: { id } }) => {
      cy.on(
        "window:before:load",
        injectEntityIds({
          questionId: id,
        }),
      );

      cy.visit({
        url: "http://localhost:4303/admin/analytics/new/from-scratch",
      });
    });

    H.main().within(() => {
      cy.findByTestId("visualization-root", { timeout: TIMEOUT });

      expect(cy.findByText("kub.macy@gmail.example").should("exist"));
    });
  });

  it("should open a new from template page", () => {
    createCollection({
      name: "Collection",
    }).then(({ body: { id: collectionId } }) => {
      H.createQuestion({
        ...QUESTION,
        name: "Test question",
        collection_id: +collectionId,
      }).then(({ body: { id: questionId } }) => {
        cy.on(
          "window:before:load",
          injectEntityIds({
            collectionId,
            questionId,
          }),
        );

        cy.visit({
          url: "http://localhost:4303/admin/analytics/new/from-template",
        });
      });
    });

    H.main().within(() => {
      cy.findByTestId("collection-table", { timeout: TIMEOUT });

      expect(cy.findByText("Test question").should("exist"));

      cy.findByText("Test question").click();

      expect(cy.findByText("kub.macy@gmail.example").should("exist"));
    });
  });

  it("should open a new dashboard page", () => {
    H.createQuestionAndDashboard({
      questionDetails: QUESTION,
    }).then(({ body: { id: questionId, dashboard_id: dashboardId } }) => {
      cy.on(
        "window:before:load",
        injectEntityIds({
          dashboardId,
          questionId,
        }),
      );

      cy.visit({
        url: "http://localhost:4303/admin/analytics/new/dashboard",
      });
    });

    getSdkRoot().within(() => {
      cy.findByTestId("new-dashboard-modal", { timeout: TIMEOUT }).within(
        () => {
          expect(cy.findByText("New dashboard").should("exist"));

          cy.findByPlaceholderText("What is the name of your dashboard?").type(
            "Test dashboard",
          );

          cy.findByText("Create").click();
        },
      );

      expect(cy.findByText("kub.macy@gmail.example").should("exist"));
    });
  });
});
