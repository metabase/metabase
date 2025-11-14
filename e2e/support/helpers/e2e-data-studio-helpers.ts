const modelingSidebar = () => cy.findByTestId("modeling-sidebar");
const collectionsSection = () => cy.findByTestId("collections-section");
const snippetsSection = () => cy.findByTestId("snippets-section");
const glossarySection = () => cy.findByTestId("glossary-section");
const newSnippetPage = () => cy.findByTestId("new-snippet-page");
const editSnippetPage = () => cy.findByTestId("edit-snippet-page");

export const DataStudio = {
  header: () => cy.findByTestId("data-studio-header"),
  transformsButton: () => DataStudio.header().findByText("Transforms"),
  jobsButton: () => DataStudio.header().findByText("Jobs"),
  runsButton: () => DataStudio.header().findByText("Runs"),
  exitButton: () => DataStudio.header().findByText("Exit data studio"),
  Transforms: {
    header: () => cy.findByTestId("transforms-header"),
    content: () => cy.findByTestId("transforms-content"),
    sidebar: () => cy.findByTestId("transforms-sidebar"),
    saveChangesButton: () => DataStudio.Transforms.queryEditor().button("Save"),
    queryEditor: () => cy.findByTestId("transform-query-editor"),
    runTab: () => DataStudio.Transforms.header().findByText("Run"),
    targetTab: () => DataStudio.Transforms.header().findByText("Target"),
    dependenciesTab: () =>
      DataStudio.Transforms.header().findByText("Dependencies"),
  },
  Jobs: {
    header: () => cy.findByTestId("jobs-header"),
    content: () => cy.findByTestId("transforms-content"),
    sidebar: () => cy.findByTestId("jobs-sidebar"),
  },
  PythonLibrary: {
    header: () => cy.findByTestId("python-library-header"),
  },
  ModelingSidebar: {
    root: modelingSidebar,
    collectionsSection,
    collectionsTree: () => collectionsSection().findByRole("tree"),
    snippetsSection,
    snippetsTree: () => snippetsSection().findByRole("tree"),
    glossarySection,
    glossaryLink: () => glossarySection().findByText("Glossary"),
    createCardMenuButton: () =>
      collectionsSection().findByLabelText("Create model or metric"),
    createSnippetButton: () =>
      snippetsSection().findByLabelText("Create snippet"),
    snippetCollectionOptionsButton: () =>
      snippetsSection().findByLabelText("Snippet collection options"),
  },
  Snippets: {
    newPage: newSnippetPage,
    editPage: editSnippetPage,
    nameInput: () => newSnippetPage().findByPlaceholderText("New SQL snippet"),
    descriptionInput: () => cy.findByPlaceholderText("No description"),
    saveButton: () => cy.findByRole("button", { name: "Save" }),
    cancelButton: () => cy.findByRole("button", { name: "Cancel" }),
    editor: () => cy.get(".cm-editor"),
  },
};
