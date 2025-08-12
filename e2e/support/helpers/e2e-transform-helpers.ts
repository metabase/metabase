/* transform list */

export const TransformListPage = {
  visit: visitTransformList,
  getCreateTransformButton,
  getCreateTransformDropdown,
};

function visitTransformList() {
  return cy.visit("/admin/transforms");
}

function getTransformListPage() {
  return cy.findByTestId("transform-list-page");
}

function getCreateTransformButton() {
  return getTransformListPage().button("Create a transform");
}

function getCreateTransformDropdown() {
  return cy.findByTestId("create-transform-dropdown");
}

/* transform query editor */

export const TransformQueryEditor = {
  getQueryEditor: getQueryEditor,
  getSaveButton: getQueryEditorSaveButton,
  getCancelButton: getQueryEditorCancelButton,
};

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}

function getQueryEditorSaveButton() {
  return getQueryEditor().button("Save");
}

function getQueryEditorCancelButton() {
  return getQueryEditor().button("Cancel");
}

/* create transform modal */
