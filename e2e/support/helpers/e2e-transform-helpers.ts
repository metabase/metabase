export const TransformListPage = {
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

export const TransformPage = {
  get() {
    return cy.findByTestId("transform-page");
  },
  runButton() {
    return this.get().findByTestId("transform-run-button");
  },
  tableLink() {
    return this.get().findByTestId("table-link");
  },
  tableMetadataLink() {
    return this.get().findByTestId("table-metadata-link");
  },
};

export const TransformQueryEditor = {
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

export const CreateTransformModal = {
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
