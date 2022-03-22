import { restore, sidebar } from "__support__/e2e/cypress";
import { getSidebarSectionTitle as getSectionTitle } from "__support__/e2e/helpers/e2e-collection-helpers";

describe("Bookmarks in a collection page", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("updates sidebar and bookmark icon color when bookmarking a collection in its page", () => {
<<<<<<< HEAD
    cy.request("POST", "/api/bookmark/collection/1");

    cy.visit("/collection/1");

=======
    cy.visit("/collection/1");

    cy.icon("bookmark").click();

>>>>>>> c2b55da0cd (Add visual test)
    sidebar().within(() => {
      getSectionTitle("Bookmarks");
    });

    cy.percySnapshot();
  });
});
