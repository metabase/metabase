import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  describeEE,
  moveOpenedCollectionTo,
  openCollectionMenu,
  popover,
  restore,
  setTokenFeatures,
} from "e2e/support/helpers";

describeEE("issue 30235", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should allow to turn to official collection after moving it from personal to root parent collection (metabase#30235)", () => {
    const COLLECTION_NAME = "C30235";

    cy.createCollection({
      name: COLLECTION_NAME,
      parent_id: ADMIN_PERSONAL_COLLECTION_ID,
    }).then(({ body: { id } }) => {
      cy.visit(`/collection/${id}`);

      moveOpenedCollectionTo("Our analytics");

      openCollectionMenu();

      popover().within(() => {
        cy.findByText("Make collection official").should("be.visible");
        cy.findByText("Edit permissions").should("be.visible");
      });
    });
  });
});
