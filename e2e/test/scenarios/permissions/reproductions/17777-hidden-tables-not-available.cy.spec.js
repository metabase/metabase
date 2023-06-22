import { restore, popover } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { USER_GROUPS, SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { ALL_USERS_GROUP } = USER_GROUPS;

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID } = SAMPLE_DATABASE;

describe.skip("issue 17777", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    hideTables([ORDERS_ID, PRODUCTS_ID, PEOPLE_ID, REVIEWS_ID]);
  });

  it("should still be able to set permissions on individual tables, even though they are hidden in data model (metabase#17777)", () => {
    cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Permissions for the All Users group");
    cy.findByTextEnsureVisible("Sample Database").click();

    cy.location("pathname").should(
      "eq",
      `/admin/permissions/data/group/${ALL_USERS_GROUP}/database/${SAMPLE_DB_ID}`,
    );

    cy.findByTestId("permission-table").within(() => {
      cy.findByText("Orders");
      cy.findByText("Products");
      cy.findByText("Reviews");
      cy.findByText("People");
    });

    cy.findAllByText("No self-service").first().click();

    popover().contains("Unrestricted");
  });
});

function hideTables(tables) {
  cy.request("PUT", "/api/table", {
    ids: tables,
    visibility_type: "hidden",
  });
}
