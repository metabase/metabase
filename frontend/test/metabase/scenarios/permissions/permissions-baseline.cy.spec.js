import {
  restore,
  visitQuestion,
  visitQuestionAdhoc,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

describe("scenarios > permissions", () => {
  beforeEach(restore);

  const PATHS = ["/dashboard/1", "/question/1", "/collection/1", "/admin"];

  for (const path of PATHS) {
    it(`should display the permissions screen on ${path}`, () => {
      cy.signIn("none");
      cy.visit(path);
      checkUnauthorized();
    });
  }

  it("should not allow to run adhoc native questions without permissions", () => {
    cy.signIn("none");

    visitQuestionAdhoc(
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

    cy.findAllByRole("button", { name: "refresh icon" }).should("be.disabled");
  });

  // There's no pulse in the fixture data, so we stub out the api call to
  // replace the 404 with a 403.
  it("should display the permissions screen for pulses", () => {
    cy.signIn("none");
    cy.server();
    cy.route({ url: /\/api\/pulse\/1/, status: 403, response: {} });
    cy.visit("/pulse/1");
    checkUnauthorized();
  });

  it("should let a user with no data permissions view questions", () => {
    cy.signIn("nodata");
    visitQuestion(1);
    cy.contains("February 11, 2019, 9:40 PM"); // check that the data loads
  });
});

const checkUnauthorized = () => {
  cy.icon("key").should("be.visible");
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "be.visible",
  );
};
