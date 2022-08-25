import { restore } from "__support__/e2e/helpers";

describe("issue 19603", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Archive second collection (nested under the first one)
    cy.request("GET", "/api/collection/").then(({ body }) => {
      const { id } = body.find(c => c.slug === "second_collection");

      cy.archiveCollection(id);
    });
  });

  it("archived subcollection should not show up in permissions (metabase#19603)", () => {
    cy.visit("/admin/permissions/collections");

    cy.findByText("First collection").click();
    cy.findByText("Second collection").should("not.exist");
  });
});
