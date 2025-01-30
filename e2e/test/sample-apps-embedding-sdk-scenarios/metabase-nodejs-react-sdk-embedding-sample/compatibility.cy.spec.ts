const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
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

describe("Embedding SDK: metabase-nodejs-react-sdk-embedding-sample compatibility", () => {
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

    cy.intercept("POST", "/api/dataset");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query");
    cy.intercept("GET", "/api/dashboard/*");
  });

  it("should open an Interactive Question", () => {
    H.createQuestion(QUESTION).then(({ body: { id } }) => {
      cy.on(
        "window:before:load",
        injectEntityIds({
          questionId: id,
        }),
      );

      cy.visit({
        url: "http://localhost:4300",
      });
    });

    getSdkRoot().within(() => {
      cy.findByTestId("query-visualization-root", { timeout: TIMEOUT });

      expect(cy.findByText("kub.macy@gmail.example").should("exist"));
    });
  });
});
