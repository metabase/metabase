import { restore } from "__support__/e2e/helpers";

describe("visual tests > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("data permissions", () => {
    it("database focused view", () => {
      cy.visit("/admin/permissions/data/database/1");
      cy.findByPlaceholderText("Search for a group");
      cy.percySnapshot();
    });

    it("database focused view > table", () => {
      cy.visit("/admin/permissions/data/database/1/schema/PUBLIC/table/1");
      cy.findByPlaceholderText("Search for a group");
      cy.findByPlaceholderText("Search for a table");
      cy.percySnapshot();
    });

    it("group focused view", () => {
      cy.visit("/admin/permissions/data/group/1");
      cy.findByPlaceholderText("Search for a database");
      cy.percySnapshot();
    });

    it("group focused view > database", () => {
      cy.visit("/admin/permissions/data/group/1/database/1");
      cy.findByPlaceholderText("Search for a table");
      cy.percySnapshot();
    });
  });

  describe("collection permissions", () => {
    it("editor", () => {
      cy.visit("/admin/permissions/collections/11");
      cy.findByPlaceholderText("Search for a group");
      cy.percySnapshot();
    });

    // This revealed the infinite loop which resulted in metabase#21026
    it.skip("modal", () => {
      cy.visit("/collection/root/permissions");
      cy.findByText("Group name");
      cy.percySnapshot();
    });
  });
});
