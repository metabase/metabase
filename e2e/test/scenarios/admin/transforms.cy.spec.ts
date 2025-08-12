import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

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

  describe("mbql transform", () => {
    function createMbqlTransform() {
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
      CreateTransformModal.nameInput().type("My transform");
      CreateTransformModal.tableNameInput().type("my_table");
      CreateTransformModal.save();
    }

    it("should be able to create and run an mbql transform", () => {
      createMbqlTransform();
      TransformPage.runAndWaitForSuccess();
      TransformPage.tableLink().click();
      H.queryBuilderHeader().findByText("My Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to change the table name and schema before running a transform", () => {
      createMbqlTransform();
      TransformPage.changeTargetButton().click();
      UpdateTargetModal.nameInput().should("have.value", "my_table");
      UpdateTargetModal.schemaSelect().should("have.value", "Schema A");
      UpdateTargetModal.keepTargetRadio().should("not.exist");
      UpdateTargetModal.deleteTargetRadio().should("not.exist");

      UpdateTargetModal.nameInput().clear().type("my_table_changed");
      UpdateTargetModal.schemaSelect().click();
      H.popover().findByText("Schema B").click();
      UpdateTargetModal.save();
      TransformPage.tableLink().should("have.text", "my_table_changed");
      TransformPage.schemaLink().should("have.text", "Schema B");

      TransformPage.runAndWaitForSuccess();
      TransformPage.tableLink().click();
      H.queryBuilderHeader()
        .findByText("My Table Changed")
        .should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });
  });
});

const TransformListPage = {
  visit() {
    cy.visit("/admin/transforms");
  },
  get() {
    return cy.findByTestId("transform-list-page");
  },
  createTransformButton() {
    return this.get().button("Create a transform");
  },
  createTransformDropdown() {
    return cy.findByTestId("create-transform-dropdown");
  },
};

const TransformPage = {
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
    return this.get().findByText(/^Keep/);
  },
  deleteTargetRadio() {
    return this.get().findByText(/^Delete/);
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
