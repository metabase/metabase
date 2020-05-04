import { restore, signInAsNormalUser } from "__support__/cypress";

describe("support > join filter (metabase#12221)", () => {
  before(restore);
  before(signInAsNormalUser);

  it.skip("can filter by a joined table", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();
    cy.get(".Icon-join_left_outer ").click();
    cy.contains("People").click();
    cy.contains("Orders + People");
    cy.contains("Visualize").click();
    cy.contains("Showing first 2,000");

    cy.contains("Filter").click();
    cy.contains("Email").click();
    cy.contains("People – Email");
    cy.get('[placeholder="Search by Email"]').type("wolf.");
    cy.contains("wolf.dina@yahoo.com").click();
    cy.contains("Add filter").click();
    cy.contains("Showing 1 row");
  });
});
