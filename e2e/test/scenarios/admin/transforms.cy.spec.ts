import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const DB_NAME = "Writable Postgres12";
const SCHEMA_NAME = "Schema a";
const TABLE_NAME = "Animals";

describe("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it("should be able to create and run a transform", () => {
    H.TransformListPage.visit();
    H.TransformListPage.createTransformButton().click();
    H.TransformListPage.createTransformDropdown()
      .findByText("Query builder")
      .click();
    H.entityPickerModal().within(() => {
      cy.findByText(DB_NAME).click();
      cy.findByText(SCHEMA_NAME).click();
      cy.findByText(TABLE_NAME).click();
    });
    H.TransformQueryEditor.saveButton().click();
    H.CreateTransformModal.nameInput().type("My transform");
    H.CreateTransformModal.tableNameInput().type("my_table");
    H.CreateTransformModal.saveButton().click();
  });
});
