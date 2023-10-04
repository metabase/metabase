import { FIRST_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  assertPermissionTable,
  modifyPermission,
  modal,
  navigationSidebar,
  popover,
  getCollectionActions,
} from "e2e/support/helpers";

const COLLECTION_ACCESS_PERMISSION_INDEX = 0;
const FIRST_COLLECTION = "First collection";

describe("issue 20911", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/collection/graph").as("getGraph");
  });

  it("should allow to change sub-collections permissions after access change (metabase#20911)", () => {
    cy.visit("/collection/root/permissions");
    cy.wait("@getGraph");
    assertPermissionTable([
      ["Administrators", "Curate"],
      ["All Users", "No access"],
      ["collection", "Curate"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);
    modifyPermission(
      "collection",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "No access",
      false,
    );
    modifyPermission(
      "collection",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "No access",
      true,
    );
    modal().within(() => {
      cy.button("Save").click();
    });

    navigationSidebar().within(() => {
      cy.findByText(FIRST_COLLECTION).click();
    });
    getCollectionActions().within(() => {
      cy.icon("ellipsis").click();
    });
    popover().within(() => {
      cy.icon("lock").click();
    });
    assertPermissionTable([
      ["Administrators", "Curate"],
      ["All Users", "No access"],
      ["collection", "No access"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);

    cy.signInAsNormalUser();
    cy.visit("/collection/root");
    cy.get("main").findByText("You don't have permissions to do that.");

    cy.visit(`/collection/${FIRST_COLLECTION_ID}`);
    cy.get("main").findByText("Sorry, you don’t have permission to see that.");
  });
});
