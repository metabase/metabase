import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  describeEE,
  restore,
  modifyPermission,
  modal,
  setTokenFeatures,
} from "e2e/support/helpers";

const DATA_ACCESS_PERMISSION_INDEX = 0;

describeEE("scenarios > admin > permissions > view data > unrestricted", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should allow perms to be set to from 'can view' to 'block' and back from database view", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Blocked");

    cy.intercept("PUT", "/api/permissions/graph").as("saveGraph");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    cy.wait("@saveGraph").then(({ response }) => {
      expect(response.statusCode).to.equal(200);
    });

    modifyPermission("All Users", DATA_ACCESS_PERMISSION_INDEX, "Can view");

    cy.button("Save changes").click();

    modal().within(() => {
      cy.findByText("Save permissions?");
      cy.button("Yes").click();
    });

    cy.wait("@saveGraph").then(({ response }) => {
      expect(response.statusCode).to.equal(200);
    });
  });
});
