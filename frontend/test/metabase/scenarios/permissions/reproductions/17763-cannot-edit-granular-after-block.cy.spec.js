import { restore, popover, describeWithToken } from "__support__/e2e/cypress";
import { USER_GROUPS } from "__support__/e2e/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

describeWithToken("issue 17763", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        1: { schemas: "block", native: "none" },
      },
    });
  });

  it('should be able to edit tables permissions in granular view after "block" permissions (metabase#17763)', () => {
    cy.visit("/admin/permissions/data/database/1");

    cy.findByText("Block").click();

    popover().contains("Granular").click();

    cy.location("pathname").should(
      "eq",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/1`,
    );

    cy.findByTestId("permission-table").within(() => {
      cy.findAllByText("No self-service").first().click();
    });

    popover().within(() => {
      cy.findByText("Unrestricted");
      cy.findByText("Sandboxed");
    });
  });
});
