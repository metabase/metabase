import { restore } from "__support__/e2e/cypress";

const UNARCHIVED_PARENT_NAME = "Unarchived parent";
const ARCHIVED_NAME = "Archived child";

describe("issue 19609", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createCollection({
      name: UNARCHIVED_PARENT_NAME,
    }).then(response => {
      const { id: collectionId } = response.body;
      cy.createCollection({
        name: ARCHIVED_NAME,
        parent_id: collectionId,
        archived: true,
      }).then(response => {
        const { id: archivedCollectionId } = response.body;
        cy.archiveCollection(archivedCollectionId);
      });
    });
  });

  it("should not show archived collections on the collections permissions page (metabase#19609)", () => {
    cy.visit("admin/permissions/collections");

    cy.findByText(UNARCHIVED_PARENT_NAME).click();
    cy.findByText(ARCHIVED_NAME).should("not.exist");
  });
});
