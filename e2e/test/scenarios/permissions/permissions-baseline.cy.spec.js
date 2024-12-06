import { H } from "e2e/support";
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

  for (const path of PATHS) {
    it(`should display the permissions screen on ${path}`, () => {
      cy.signIn("none");
      cy.visit(path);
      checkUnauthorized();
    });
  }

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

    cy.findAllByLabelText("Refresh").should("be.disabled");
  });

  it("should let a user with no data permissions view questions", () => {
    cy.signIn("nodata");
    H.visitQuestion(ORDERS_QUESTION_ID);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("February 11, 2025, 9:40 PM"); // check that the data loads
  });
});

const checkUnauthorized = () => {
  cy.icon("key").should("be.visible");
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "be.visible",
  );
};
