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
      CreateTransformModal.saveButton().click();
    }

    it("should be able to create and run an mbql transform", () => {
      createMbqlTransform();
      TransformPage.runAndWaitForSuccess();
      TransformPage.tableLink().click();
      H.queryBuilderHeader().findByText("My Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to change the target before running a transform", () => {
      createMbqlTransform();
      TransformPage.changeTargetButton().click();
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
  runAndWaitForSuccess() {
    this.runButton().click();
    this.runButton().should("have.text", "Ran successfully");
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
};
