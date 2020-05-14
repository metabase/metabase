import { signIn, restore } from "__support__/cypress";

describe("scenarios > permissions", () => {
  before(restore);

  const PATHS = [
    "/dashboard/1",
    "/question/1",
    "/collection/1",
    "/admin",
    // this url is a native query pointing at the sample db
    "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7InR5cGUiOiJuYXRpdmUiLCJuYXRpdmUiOnsicXVlcnkiOiJzZWxlY3QgMSIsInRlbXBsYXRlLXRhZ3MiOnt9fSwiZGF0YWJhc2UiOjF9LCJkaXNwbGF5IjoidGFibGUiLCJ2aXN1YWxpemF0aW9uX3NldHRpbmdzIjp7fX0=",
  ];

  for (const path of PATHS) {
    it(`should display the permissions screen on ${path}`, () => {
      signIn("none");
      cy.visit(path);
      cy.get(".Icon-key");
      cy.contains("Sorry, you don’t have permission to see that.");
    });
  }

  // There's no pulse in the fixture data, so we stub out the api call to
  // replace the 404 with a 403.
  it("should display the permissions screen for pulses", () => {
    signIn("none");
    cy.server();
    cy.route({ url: /\/api\/pulse\/1/, status: 403, response: {} });
    cy.visit("/pulse/1");
    cy.get(".Icon-key");
    cy.contains("Sorry, you don’t have permission to see that.");
  });

  it("should let a user with no data permissions view questions", () => {
    signIn("nodata");
    cy.visit("/question/1");
    cy.contains("February 11, 2019, 9:40 PM"); // check that the data loads
  });
});
