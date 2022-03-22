import { restore, sidebar } from "__support__/e2e/cypress";
import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

describe("Bookmarks in a collection page", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("updates sidebar and bookmark icon color when bookmarking a collection in its page", () => {
    cy.visit("/collection/1");

    cy.icon("bookmark").click();

    sidebar().within(() => {
      getSectionTitle("Bookmarks");
    });

    cy.percySnapshot();
  });
});
