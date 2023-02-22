import { restore } from "__support__/e2e/helpers";
import { USER_GROUPS, SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ALL_USERS_GROUP } = USER_GROUPS;
const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("visual tests > admin > permissions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("data permissions", () => {
    it("database focused view", () => {
      cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
      cy.findByPlaceholderText("Search for a group");
      cy.createPercySnapshot();
    });

    it("database focused view > table", () => {
      cy.visit(
        `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${PRODUCTS_ID}`,
      );
      cy.findByPlaceholderText("Search for a group");
      cy.findByPlaceholderText("Search for a table");
      cy.createPercySnapshot();
    });

    it("group focused view", () => {
      cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);
      cy.findByPlaceholderText("Search for a database");
      cy.createPercySnapshot();
    });

    it("group focused view > database", () => {
      cy.visit(
        `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
      );
      cy.findByPlaceholderText("Search for a table");
      cy.createPercySnapshot();
    });
  });

  describe("collection permissions", () => {
    it("editor", () => {
      cy.visit("/admin/permissions/collections/11");
      cy.findByPlaceholderText("Search for a group");
      cy.createPercySnapshot();
    });

    // This revealed the infinite loop which resulted in metabase#21026
    it.skip("modal", () => {
      cy.visit("/collection/root/permissions");
      cy.findByText("Group name");
      cy.createPercySnapshot();
    });
  });
});
