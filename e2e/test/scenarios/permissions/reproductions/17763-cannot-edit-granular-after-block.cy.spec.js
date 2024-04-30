import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import {
  restore,
  popover,
  describeEE,
  setTokenFeatures,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP } = USER_GROUPS;

describeEE("issue 17763", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");

    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        1: {
          "view-data": "blocked",
          "create-queries": "no",
        },
      },
    });
  });

  it('should be able to edit tables permissions in granular view after "block" permissions (metabase#17763)', () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Blocked").click();

    popover().contains("Granular").click();

    cy.location("pathname").should(
      "eq",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
    );

    cy.findByTestId("permission-table").within(() => {
      cy.findAllByText("Can view").first().click();
    });

    popover().within(() => {
      cy.findByText("Sandboxed");
    });
  });
});
