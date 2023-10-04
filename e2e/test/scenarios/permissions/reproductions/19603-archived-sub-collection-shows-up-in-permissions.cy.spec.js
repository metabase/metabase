import { restore } from "e2e/support/helpers";

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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("First collection").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Second collection").should("not.exist");
  });
});
