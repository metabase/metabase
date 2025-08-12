import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { TransformId } from "metabase-types/api";

const { H } = cy;

const DB_NAME = "Writable Postgres12";

describe("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it("should be able to create and run an mbql transform", () => {
    TransformListPage.visit();
    TransformListPage.createTransformButton().click();
    TransformListPage.createTransformDropdown()
      .findByText("Query builder")
      .click();

    H.entityPickerModal().within(() => {
      cy.findByText(DB_NAME).click();
      cy.findByText("Schema a").click();
      cy.findByText("Animals").click();
    });
    TransformQueryEditor.saveButton().click();
    CreateTransformModal.nameInput().type("MBQL transform");
    CreateTransformModal.tableNameInput().type("transform_table");
    CreateTransformModal.save();

    TransformPage.runAndWaitForSuccess();
    TransformPage.tableLink().click();
    H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
    H.assertQueryBuilderRowCount(3);
  });

  it("should be able to change the target before running a transform", () => {
    cy.log("create but do not run the transform");
    createMbqlTransform();
    cy.get<TransformId>("@transformId").then((id) => TransformPage.visit(id));

    cy.log("modify the transform before running");
    TransformPage.changeTargetButton().click();
    UpdateTargetModal.nameInput().should("have.value", "transform_table");
    UpdateTargetModal.schemaSelect().should("have.value", "Schema A");
    UpdateTargetModal.keepTargetRadio().should("not.exist");
    UpdateTargetModal.deleteTargetRadio().should("not.exist");
    UpdateTargetModal.nameInput().clear().type("transform_table_2");
    UpdateTargetModal.schemaSelect().click();
    H.popover().findByText("Schema B").click();
    UpdateTargetModal.save();
    TransformPage.tableLink().should("have.text", "transform_table_2");
    TransformPage.schemaLink().should("have.text", "Schema B");

    cy.log("run the transform and verify the table");
    TransformPage.runAndWaitForSuccess();
    TransformPage.tableLink().click();
    H.queryBuilderHeader().findByText("Transform Table 2").should("be.visible");
    H.assertQueryBuilderRowCount(3);
  });

  it("should be able to change the target after running a transform and keep the old target", () => {
    cy.log("create and run a transform");
    createMbqlTransform();
    cy.get<TransformId>("@transformId").then((id) => TransformPage.visit(id));
    TransformPage.runAndWaitForSuccess();

    cy.log("modify the transform after running");
    TransformPage.changeTargetButton().click();
    UpdateTargetModal.nameInput().should("have.value", "transform_table");
    UpdateTargetModal.schemaSelect().should("have.value", "Schema A");
    UpdateTargetModal.keepTargetRadio().should("be.checked");
    UpdateTargetModal.nameInput().clear().type("transform_table_2");
    UpdateTargetModal.save();
    TransformPage.tableLink().should("have.text", "transform_table_2");

    cy.log("run the transform and verify the table");
    TransformPage.runAndWaitForSuccess();
    TransformPage.tableLink().click();
    H.queryBuilderHeader().findByText("Transform Table 2").should("be.visible");
    H.assertQueryBuilderRowCount(3);

    cy.log("verify that the original question still works");
    H.createNativeQuestion(
      {
        database: WRITABLE_DB_ID,
        native: { query: 'SELECT * FROM "Schema A".transform_table' },
      },
      { visitQuestion: true },
    );
    H.assertTableRowsCount(3);
  });
});

function createMbqlTransform() {
  H.getTableId({ name: "Animals" }).then((tableId) => {
    H.createTransform(
      {
        name: "MBQL transform",
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "query",
            query: {
              "source-table": tableId,
            },
          },
        },
        target: {
          type: "table",
          name: "transform_table",
          schema: "Schema A",
        },
      },
      { wrapId: true },
    );
  });
}

const TransformListPage = {
  visit() {
    cy.visit("/admin/transforms");
  },
  get() {
    return cy.findByTestId("transform-list-page");
  },
  transformTable() {
    return this.get().findByTestId("admin-content-table");
  },
  createTransformButton() {
    return this.get().button("Create a transform");
  },
  createTransformDropdown() {
    return cy.findByTestId("create-transform-dropdown");
  },
};

const TransformPage = {
  visit(id: TransformId) {
    cy.visit(`/admin/transforms/${id}`);
  },
  get() {
    return cy.findByTestId("transform-page");
  },
  runButton() {
    return this.get().findByTestId("run-button");
  },
  schemaLink() {
    return this.get().findByTestId("schema-link");
  },
  tableLink() {
    return this.get().findByTestId("table-link");
  },
  tableMetadataLink() {
    return this.get().findByTestId("table-metadata-link");
  },
  changeTargetButton() {
    return this.get().findByTestId("change-target-button");
  },
  runAndWaitForSuccess() {
    this.runButton().click();
    this.runButton().should("have.text", "Ran successfully");
  },
};

const TransformQueryEditor = {
  get() {
    return cy.findByTestId("transform-query-editor");
  },
  saveButton() {
    return this.get().button("Save");
  },
  cancelButton() {
    return this.get().button("Cancel");
  },
};

const CreateTransformModal = {
  get() {
    return cy.findByTestId("create-transform-modal");
  },
  nameInput() {
    return this.get().findByLabelText("Name");
  },
  descriptionInput() {
    return this.get().findByLabelText("Description");
  },
  schemaSelect() {
    return this.get().findByLabelText("Schema");
  },
  tableNameInput() {
    return this.get().findByLabelText("Table name");
  },
  saveButton() {
    return this.get().button("Save");
  },
  cancelButton() {
    return this.get().button("Cancel");
  },
  save() {
    H.interceptIfNotPreviouslyDefined({
      method: "POST",
      url: "/api/ee/transform",
      alias: "createTransform",
    });
    this.saveButton().click();
    cy.wait("@createTransform");
  },
};

const UpdateTargetModal = {
  get() {
    return cy.findByTestId("update-target-modal");
  },
  nameInput() {
    return this.get().findByLabelText(
      "What should it be called in the database?",
    );
  },
  schemaSelect() {
    return this.get().findByLabelText("In which schema should it go?");
  },
  keepTargetRadio() {
    return this.get().findByTestId("keep-target-radio");
  },
  deleteTargetRadio() {
    return this.get().findByTestId("delete-target-radio");
  },
  saveButton() {
    return this.get().button(/^Change target/);
  },
  cancelButton() {
    return this.get().button("Cancel");
  },
  save() {
    H.interceptIfNotPreviouslyDefined({
      method: "PUT",
      url: "/api/ee/transform/*",
      alias: "updateTransform",
    });
    this.saveButton().click();
    cy.wait("@updateTransform");
  },
};
