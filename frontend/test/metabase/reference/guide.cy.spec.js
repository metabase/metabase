import { signInAsAdmin, restore } from "__support__/cypress";
describe("getting started guide", () => {
  before(restore);
  beforeEach(signInAsAdmin);
  it("should render", () => {
    cy.visit("/reference");
    cy.contains("Our data");
  });
});
