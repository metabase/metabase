const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > permissions", () => {
  beforeEach(H.restore);

  const PATHS = [
    `/dashboard/${ORDERS_DASHBOARD_ID}`,
    `/question/${ORDERS_QUESTION_ID}`,
    `/collection/${ADMIN_PERSONAL_COLLECTION_ID}`,
    "/admin",
  ];

  it("should display the permissions screen on pages the user can't access", () => {
    cy.signIn("none");

    PATHS.forEach((path) => {
      cy.log(path);
      cy.visit(path);
      checkUnauthorized();
    });
  });

  it("should not allow to run adhoc native questions without permissions", () => {
    cy.signIn("none");

    H.visitQuestionAdhoc(
      {
        display: "scalar",
        dataset_query: {
          type: "native",
          native: {
            query: "SELECT 1",
          },
          database: SAMPLE_DB_ID,
        },
      },
      { autorun: false },
    );

    cy.findByTestId("native-query-editor-container")
      .findByTestId("run-button")
      .should("be.visible")
      .and("be.disabled");
  });
});

const checkUnauthorized = () => {
  cy.icon("key").should("be.visible");
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "be.visible",
  );
};
