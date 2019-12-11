import { signInAsAdmin } from "__support__/cypress";
describe("getting started guide", () => {
  beforeEach(signInAsAdmin);
  it("should render", () => {
    cy.visit("reference");
    cy.contains("Our data");
  });
});
