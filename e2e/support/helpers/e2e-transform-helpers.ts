export const TransformListPage = {
  visit: () => {
    cy.visit("/admin/transforms");
  },
  get: () => {
    return cy.findByTestId("transform-list-page");
  },
  createTransformButton: () => {
    return TransformListPage.get().button("Create a transform");
  },
  createTransformDropdown: () => {
    return cy.findByTestId("create-transform-dropdown");
  },
};

export const TransformQueryEditor = {
  get: () => {
    return cy.findByTestId("transform-query-editor");
  },
  saveButton: () => {
    return TransformQueryEditor.get().button("Save");
  },
  cancelButton: () => {
    return TransformQueryEditor.get().button("Cancel");
  },
};

export const CreateTransformModal = {
  get: () => {
    return cy.findByTestId("create-transform-modal");
  },
  nameInput: () => {
    return CreateTransformModal.get().findByLabelText("Name");
  },
  descriptionInput: () => {
    return CreateTransformModal.get().findByLabelText("Description");
  },
  schemaSelect: () => {
    return CreateTransformModal.get().findByLabelText("Schema");
  },
  tableNameInput: () => {
    return CreateTransformModal.get().findByLabelText("Table name");
  },
  saveButton: () => {
    return CreateTransformModal.get().button("Save");
  },
  cancelButton: () => {
    return CreateTransformModal.get().button("Cancel");
  },
};
