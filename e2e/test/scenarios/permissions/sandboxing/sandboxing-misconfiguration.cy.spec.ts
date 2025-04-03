import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";

import {
  assertResponseFailsClosed,
  assignAttributeToUser,
  configureSandboxPolicy,
  getCardResponses,
  gizmoViewer,
  rowsShouldContainOnlyOneCategory,
  signInAs,
} from "./helpers/e2e-sandboxing-helpers";

const { H } = cy;

describe("admin > permissions > sandboxing > misconfiguration", () => {
  before(() => {
    H.restore("postgres-writable");

    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    H.blockUserGroupPermissions(USER_GROUPS.ALL_USERS_GROUP, WRITABLE_DB_ID);
    H.blockUserGroupPermissions(USER_GROUPS.COLLECTION_GROUP, WRITABLE_DB_ID);
    H.blockUserGroupPermissions(USER_GROUPS.READONLY_GROUP, WRITABLE_DB_ID);

    // @ts-expect-error - this isn't typed yet
    cy.createUserFromRawData(gizmoViewer);

    cy.log("Create a simple editable products table");
    H.queryWritableDB("DROP TABLE IF EXISTS products");
    H.queryWritableDB(
      "CREATE TABLE IF NOT EXISTS products (id INT PRIMARY KEY, category VARCHAR, name VARCHAR)",
    );
    H.queryWritableDB(
      "INSERT INTO products (id, name, category) VALUES (1, 'A', 'Gizmo'), (2, 'B', 'Widget')",
    );
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "products" });

    H.snapshot("sandboxing-misconfiguration-snapshot");
  });

  beforeEach(() => {
    cy.signInAsAdmin();
    H.restore("sandboxing-misconfiguration-snapshot" as any);
  });

  it("if we create a sandboxing policy on a column but then the column is deleted, the sandboxing system fails closed", () => {
    assignAttributeToUser({ user: gizmoViewer, attributeValue: "Gizmo" });
    configureSandboxPolicy(
      {
        filterTableBy: "column",
        filterColumn: "Category",
      },
      {
        tableName: "Products",
        databaseId: WRITABLE_DB_ID,
      },
    );

    const questionData = {
      name: "Simple question based on the 'Products' table",
      model: "card",
    };

    H.getTableId({
      name: "products",
    }).then((tableId) => {
      H.createQuestion(
        {
          database: WRITABLE_DB_ID,
          name: questionData.name,
          query: {
            "source-table": tableId,
            limit: 20,
          },
        },
        { wrapId: true },
      );
    });

    signInAs(gizmoViewer);

    cy.get<number>("@questionId").then((questionId) => {
      getCardResponses([{ ...questionData, id: questionId }]).then((data) =>
        rowsShouldContainOnlyOneCategory({
          ...data,
          productCategory: "Gizmo",
        }),
      );

      H.queryWritableDB("ALTER TABLE products DROP COLUMN category");

      cy.log(
        "After the column is dropped, the sandboxing system should fail closed",
      );
      getCardResponses([{ ...questionData, id: questionId }]).then(
        ({ responses }) => responses.forEach(assertResponseFailsClosed),
      );
    });
  });
});
