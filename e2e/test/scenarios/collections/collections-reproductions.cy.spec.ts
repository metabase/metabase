const { H } = cy;
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { CollectionId } from "metabase-types/api";

describe("issue 24660", () => {
  const collectionName = "Parent";

  const questions = {
    [ORDERS_QUESTION_ID]: "Orders",
    [ORDERS_COUNT_QUESTION_ID]: "Orders, Count",
  };

  function createParentCollectionAndMoveQuestionToIt(questionId: number) {
    return H.createCollection({
      name: collectionName,
      parent_id: null,
    }).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${questionId}`, {
        collection_id: id,
      });
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    createParentCollectionAndMoveQuestionToIt(ORDERS_QUESTION_ID);
    createParentCollectionAndMoveQuestionToIt(ORDERS_COUNT_QUESTION_ID);
  });

  it("should properly show contents of different collections with the same name (metabase#24660)", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      cy.findByText("Our analytics").click();
      cy.findAllByText(collectionName).first().click();

      cy.findByText(questions[ORDERS_QUESTION_ID]).should("exist");
      cy.findByText(questions[ORDERS_COUNT_QUESTION_ID]).should("not.exist");
      cy.realType("{esc}");
    });

    cy.findByPlaceholderText("Search for tables and more...").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findAllByText(collectionName).first().click();
      cy.findByText(questions[ORDERS_QUESTION_ID]).should("exist");
      cy.findByText(questions[ORDERS_COUNT_QUESTION_ID]).should("not.exist");
    });
  });
});

describe("issue 30235", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should allow to turn to official collection after moving it from personal to root parent collection (metabase#30235)", () => {
    const COLLECTION_NAME = "C30235";

    H.createCollection({
      name: COLLECTION_NAME,
      parent_id: ADMIN_PERSONAL_COLLECTION_ID,
    }).then(({ body: { id } }) => {
      cy.visit(`/collection/${id}`);

      H.moveOpenedCollectionTo("Our analytics");

      H.openCollectionMenu();

      H.popover().within(() => {
        cy.findByText("Make collection official").should("be.visible");
        cy.findByText("Edit permissions").should("be.visible");
      });
    });
  });
});

describe("issue 58231", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should allow to edit permissions for Usage Analytics collection (metabase#58231)", () => {
    cy.visit("/collection/2-usage-analytics");

    cy.findByTestId("collection-menu")
      .findByLabelText("Edit permissions")
      .should("be.visible")
      .click();

    H.modal()
      .findByText("Permissions for Usage analytics")
      .should("be.visible");
  });
});

describe("issue 56567", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  const withTestCollections = (
    callback: (
      collectionAId: CollectionId,
      collectionBId: CollectionId,
    ) => void,
  ) => {
    H.createCollection({
      name: "A",
    }).then(({ body: collectionA }) => {
      const collectionAId = collectionA.id;

      H.createCollection({
        name: "B",
        parent_id: collectionA.id,
      }).then(({ body: collectionB }) => {
        const collectionBId = collectionB.id;
        callback(collectionAId, collectionBId);
      });
    });
  };

  const getTestPermissionsTable = (allUsersPermission: string) => [
    ["Administrators", "Curate"],
    ["All Users", allUsersPermission],
    ["collection", "Curate"],
    ["data", "No access"],
    ["Data Analysts", "No access"],
    ["nosql", "No access"],
    ["readonly", "View"],
  ];

  it("should propagate permission to sub-collections when 'Also change sub-collections' is checked (metabase#56567)", () => {
    withTestCollections((collectionAId, collectionBId) => {
      cy.visit(`/admin/permissions/collections/${collectionAId}`);

      H.assertPermissionTable(getTestPermissionsTable("No access"));

      cy.visit(`/admin/permissions/collections/${collectionBId}`);

      H.assertPermissionTable(getTestPermissionsTable("No access"));

      cy.visit(`/collection/${collectionAId}-a/permissions`);

      // opens up the permissions select
      H.getPermissionRowPermissions("All Users").click();

      // checks the 'Also change sub-collections' toggle
      H.popover().findByRole("switch").click();
      H.popover().findByRole("switch").should("be.checked");

      // selected desired permission
      H.popover().findByText("View").click();

      // opens up the permissions select again
      H.getPermissionRowPermissions("All Users").click();

      // ensures the toggle is still checked
      H.popover().findByRole("switch").should("be.checked");

      cy.intercept("PUT", "/api/collection/graph?skip-graph=true").as(
        "savePermissions",
      );
      cy.button("Save").click();
      cy.wait("@savePermissions");

      // Checks permissions for collection A is set to "View" as expected
      cy.visit(`/admin/permissions/collections/${collectionBId}`);
      H.assertPermissionTable(getTestPermissionsTable("View"));

      // Check the permission set to collection A was propagated to collection B
      cy.visit(`/admin/permissions/collections/${collectionBId}`);
      H.assertPermissionTable(getTestPermissionsTable("View"));
    });
  });

  it("should NOT propagate permission to sub-collections when 'Also change sub-collections' is unchecked", () => {
    withTestCollections((collectionAId, collectionBId) => {
      cy.visit(`/admin/permissions/collections/${collectionBId}`);

      H.assertPermissionTable(getTestPermissionsTable("No access"));

      cy.visit(`/collection/${collectionAId}-a/permissions`);

      // opens up the permissions select
      H.getPermissionRowPermissions("All Users").click();

      // selected desired permission without checking 'Also change sub-collections'
      H.popover().findByText("View").click();

      // opens up the permissions select again
      H.getPermissionRowPermissions("All Users").click();

      // ensures the toggle is not checked
      H.popover().findByRole("switch").should("not.be.checked");

      cy.intercept("PUT", "/api/collection/graph?skip-graph=true").as(
        "savePermissions",
      );
      cy.button("Save").click();
      cy.wait("@savePermissions");

      // Checks permissions for collection A is set to "View" as expected
      cy.visit(`/admin/permissions/collections/${collectionAId}`);
      H.assertPermissionTable(getTestPermissionsTable("View"));

      // Check the permission set to collection A was NOT propagated to collection B
      cy.visit(`/admin/permissions/collections/${collectionBId}`);
      H.assertPermissionTable(getTestPermissionsTable("No access"));
    });
  });
});
