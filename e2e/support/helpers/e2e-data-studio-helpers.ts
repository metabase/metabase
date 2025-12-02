import { codeMirrorHelpers } from "./e2e-codemirror-helpers";

const modelingSidebar = () => cy.findByTestId("modeling-sidebar");
const librarySection = () => cy.findByTestId("library-section");
const snippetsSection = () => cy.findByTestId("snippets-section");
const glossarySection = () => cy.findByTestId("glossary-section");
const newSnippetPage = () => cy.findByTestId("new-snippet-page");
const editSnippetPage = () => cy.findByTestId("edit-snippet-page");
const metricOverviewPage = () => cy.findByTestId("metric-overview-page");
const metricQueryEditor = () => cy.findByTestId("metric-query-editor");
const modelOverviewPage = () => cy.findByTestId("model-overview-page");
const modelQueryEditor = () => cy.findByTestId("model-query-editor");
const modelFieldsPage = () => cy.findByTestId("model-fields-page");
const collectionPage = () => cy.findByTestId("collection-page");
const modelingEmptyPage = () =>
  cy.findByText("Pick a collection or create a new model or metric");

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
    librarySection,
    collectionsTree: () => librarySection().findByRole("tree"),
    snippetsSection,
    snippetsTree: () => snippetsSection().findByRole("tree"),
    snippetsTreeItem: (name: string) =>
      snippetsSection()
        .findByRole("tree")
        .findByText(name)
        .closest("[role='menuitem']"),
    glossarySection,
    glossaryLink: () => glossarySection().findByText("Glossary"),
    createCardMenuButton: () =>
      librarySection().findByLabelText("Create model or metric"),
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
    editor: codeMirrorHelpers("snippet-editor", {}),
  },
  Metrics: {
    overviewPage: metricOverviewPage,
    queryEditor: metricQueryEditor,
    nameInput: () => metricQueryEditor().findByPlaceholderText("New metric"),
    saveButton: () =>
      metricQueryEditor().findByRole("button", { name: "Save" }),
    cancelButton: () =>
      metricQueryEditor().findByRole("button", { name: "Cancel" }),
    header: () => cy.findByTestId("metric-header"),
    moreMenu: () => DataStudio.Metrics.header().icon("ellipsis"),
    overviewTab: () => DataStudio.Metrics.header().findByText("Overview"),
    definitionTab: () => DataStudio.Metrics.header().findByText("Definition"),
    dependenciesTab: () =>
      DataStudio.Metrics.header().findByText("Dependencies"),
  },
  Models: {
    overviewPage: modelOverviewPage,
    queryEditor: modelQueryEditor,
    fieldsPage: modelFieldsPage,
    nameInput: () => modelQueryEditor().findByPlaceholderText("New model"),
    saveButton: () => modelQueryEditor().findByRole("button", { name: "Save" }),
    cancelButton: () =>
      modelQueryEditor().findByRole("button", { name: "Cancel" }),
    header: () => cy.findByTestId("model-header"),
    moreMenu: () => DataStudio.Models.header().icon("ellipsis"),
    overviewTab: () => DataStudio.Models.header().findByText("Overview"),
    definitionTab: () => DataStudio.Models.header().findByText("Definition"),
    fieldsTab: () => DataStudio.Models.header().findByText("Fields"),
    dependenciesTab: () =>
      DataStudio.Models.header().findByText("Dependencies"),
  },
  Modeling: {
    emptyPage: modelingEmptyPage,
    collectionPage: collectionPage,
    collectionTitle: () => collectionPage().findByRole("heading"),
    metricItem: (name: string) => cy.findByTestId("metric-name").contains(name),
    modelItem: (name: string) => cy.findByTestId("dataset-name").contains(name),
  },
};
