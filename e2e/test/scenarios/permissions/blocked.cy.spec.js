import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  assertSameBeforeAndAfterSave,
  createNativeQuestion,
  restore,
  describeEE,
  setTokenFeatures,
  modifyPermission,
  assertPermissionForItem,
  visitQuestion,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const DATA_ACCESS_PERM_IDX = 0;

describeEE("scenarios > admin > permissions > view data > blocked", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should deny view access to a query builder question that makes use of a blocked table", () => {
    assertCollectionGroupUserHasAccess(ORDERS_QUESTION_ID, true);
    cy.visit(
      `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
    );
    removeCollectionGroupPermissions();
    assertCollectionGroupHasNoAccess(ORDERS_QUESTION_ID, true);
  });

  it("should deny view access to a query builder question that makes use of a blocked database", () => {
    assertCollectionGroupUserHasAccess(ORDERS_QUESTION_ID, true);
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    removeCollectionGroupPermissions();
    assertCollectionGroupHasNoAccess(ORDERS_QUESTION_ID, true);
  });

  it("should deny view access to any native question if the user has blocked view data for any table or database", () => {
    createNativeQuestion({
      native: { query: "select 1" },
    }).then(({ body: { id: nativeQuestionId } }) => {
      assertCollectionGroupUserHasAccess(nativeQuestionId, false);
      cy.visit(
        `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${ORDERS_ID}`,
      );
      removeCollectionGroupPermissions();
      assertCollectionGroupHasNoAccess(nativeQuestionId, false);
    });
  });
});

function lackPermissionsView(isQbQuestion, shouldExist) {
  if (isQbQuestion) {
    cy.findByText("There was a problem with your question").should(
      shouldExist ? "exist" : "not.exist",
    );

    if (shouldExist) {
      cy.findByText("Show error details").click();
    }
  }

  cy.findByText(/You do not have permissions to run this query/).should(
    shouldExist ? "exist" : "not.exist",
  );
}

// NOTE: all helpers below make user of the "sandboxed" user and "collection" group to test permissions
// as this user is of only one group and has permission to view existing question

function assertCollectionGroupUserHasAccess(questionId, isQbQuestion) {
  cy.signOut();
  cy.signIn("sandboxed");

  visitQuestion(questionId);
  lackPermissionsView(isQbQuestion, false);

  cy.signOut();
  cy.signInAsAdmin();
}

function assertCollectionGroupHasNoAccess(questionId, isQbQuestion) {
  cy.signOut();
  cy.signIn("sandboxed");

  visitQuestion(questionId);

  lackPermissionsView(isQbQuestion, true);
}

function removeCollectionGroupPermissions() {
  assertPermissionForItem("All Users", DATA_ACCESS_PERM_IDX, "Can view", false);
  assertPermissionForItem(
    "collection",
    DATA_ACCESS_PERM_IDX,
    "Can view",
    false,
  );
  modifyPermission("All Users", DATA_ACCESS_PERM_IDX, "Blocked");
  modifyPermission("collection", DATA_ACCESS_PERM_IDX, "Blocked");
  assertSameBeforeAndAfterSave(() => {
    assertPermissionForItem(
      "All Users",
      DATA_ACCESS_PERM_IDX,
      "Blocked",
      false,
    );
    assertPermissionForItem(
      "collection",
      DATA_ACCESS_PERM_IDX,
      "Blocked",
      false,
    );
  });
}
