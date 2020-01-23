import { signInAsAdmin, signInAsNormalUser } from "__support__/cypress";

describe("permissions", () => {
  before(() => {
    signInAsAdmin();
    cy.request("PUT", "/api/permissions/graph", {
      revision: 0,
      groups: {
        "1": { "1": { native: "none", schemas: "none" } },
        "2": { "1": { native: "write", schemas: "all" } },
      },
    });
    cy.request("PUT", "/api/collection/graph", {
      revision: 0,
      groups: {
        "1": { root: "none" },
        "2": { root: "write" },
      },
    });
  });
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
      signInAsNormalUser();
      cy.visit(path);
      cy.get(".Icon-key");
      cy.contains("Sorry, you don’t have permission to see that.");
    });
  }

  // There's no pulse in the fixture data, so we stub out the api call to
  // replace the 404 with a 403.
  it("should display the permissions screen for pulses", () => {
    signInAsNormalUser();
    cy.server();
    cy.route({ url: /\/api\/pulse\/1/, status: 403, response: {} });
    cy.visit("/pulse/1");
    cy.get(".Icon-key");
    cy.contains("Sorry, you don’t have permission to see that.");
  });
});
