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

describe("issue 20911", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/collection/graph").as("getGraph");
  });

  it("should allow to change sub-collections permissions after access change (metabase#20911)", () => {
    cy.request("POST", "/api/collection", {
      name: `Collection 1`,
      color: "#509EE3",
      parent_id: null,
    });

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
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "View",
      false,
    );
    modifyPermission(
      "All Users",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      null,
      true,
    );
    modal().within(() => {
      cy.button("Save").click();
    });

    navigationSidebar().within(() => {
      cy.findByText("Collection 1").click();
    });
    getCollectionActions().within(() => {
      cy.icon("ellipsis").click();
    });
    popover().within(() => {
      cy.icon("lock").click();
    });
    assertPermissionTable([
      ["Administrators", "Curate"],
      ["All Users", "View"],
      ["collection", "Curate"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);
  });
});
