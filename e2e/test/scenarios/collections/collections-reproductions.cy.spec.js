import { H } from "e2e/support";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("issue 20911", () => {
  const COLLECTION_ACCESS_PERMISSION_INDEX = 0;
  const FIRST_COLLECTION = "First collection";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/collection/graph").as("getGraph");
  });

  it("should allow to change sub-collections permissions after access change (metabase#20911)", () => {
    cy.visit("/collection/root/permissions");
    cy.wait("@getGraph");
    H.assertPermissionTable([
      ["Administrators", "Curate"],
      ["All Users", "No access"],
      ["collection", "Curate"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);
    H.modifyPermission(
      "collection",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "No access",
      false,
    );
    H.modifyPermission(
      "collection",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "No access",
      true,
    );
    H.modal().within(() => {
      cy.button("Save").click();
    });

    H.navigationSidebar().within(() => {
      cy.findByText(FIRST_COLLECTION).click();
    });
    H.getCollectionActions().within(() => {
      cy.icon("ellipsis").click();
    });
    H.popover().within(() => {
      cy.icon("lock").click();
    });
    H.assertPermissionTable([
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

describe("issue 24660", () => {
  const collectionName = "Parent";

  const questions = {
    [ORDERS_QUESTION_ID]: "Orders",
    [ORDERS_COUNT_QUESTION_ID]: "Orders, Count",
  };

  function createParentCollectionAndMoveQuestionToIt(questionId) {
    return cy
      .createCollection({
        name: collectionName,
        parent_id: null,
      })
      .then(({ body: { id } }) => {
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
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Saved questions").click();
      cy.findAllByText(collectionName).first().click();

      cy.findByText(questions[ORDERS_QUESTION_ID]).should("exist");
      cy.findByText(questions[ORDERS_COUNT_QUESTION_ID]).should("not.exist");
    });
  });
});

H.describeEE("issue 30235", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
  });

  it("should allow to turn to official collection after moving it from personal to root parent collection (metabase#30235)", () => {
    const COLLECTION_NAME = "C30235";

    cy.createCollection({
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
