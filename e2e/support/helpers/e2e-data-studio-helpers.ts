import type { TableId } from "metabase-types/api";

import { codeMirrorHelpers } from "./e2e-codemirror-helpers";
import { popover } from "./e2e-ui-elements-helpers";

const modelingSidebar = () => cy.findByTestId("modeling-sidebar");
const modelingPage = () => cy.findByTestId("modeling-page");
const collectionsSection = () => cy.findByTestId("collections-section");
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

export const DataStudio = {
  header: () => cy.findByTestId("data-studio-header"),
  nav: () => cy.findByTestId("data-studio-nav"),
  Transforms: {
    header: () => cy.findByTestId("transforms-header"),
    list: () => cy.findByTestId("transforms-list"),
    saveChangesButton: () => DataStudio.Transforms.queryEditor().button("Save"),
    queryEditor: () => cy.findByTestId("transform-query-editor"),
    runTab: () => DataStudio.Transforms.header().findByText("Run"),
    targetTab: () => DataStudio.Transforms.header().findByText("Target"),
    dependenciesTab: () =>
      DataStudio.Transforms.header().findByText("Dependencies"),
  },
  Jobs: {
    header: () => cy.findByTestId("jobs-header"),
    list: () => cy.findByTestId("transforms-job-list"),
    editor: () => cy.findByTestId("transforms-jobs-editor"),
  },
  Runs: {
    list: () => cy.findByTestId("transforms-run-list"),
    content: () => cy.findByTestId("transforms-run-content"),
  },
  Dependencies: {
    content: () => cy.findByTestId("transforms-dependencies-content"),
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
    snippetsTreeItem: (name: string) =>
      snippetsSection()
        .findByRole("tree")
        .findByText(name)
        .closest("[role='menuitem']"),
    glossarySection,
    glossaryLink: () => glossarySection().findByText("Glossary"),
    createCardMenuButton: () =>
      collectionsSection().findByLabelText("Create metric"),
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
  Tables: {
    overviewPage: () => cy.findByTestId("table-overview-page"),
    fieldsPage: () => cy.findByTestId("table-fields-page"),
    dependenciesPage: () => cy.findByTestId("table-dependencies-page"),
    header: () => cy.findByTestId("table-pane-header"),
    nameInput: () => cy.findByTestId("table-name-input"),
    moreMenu: () => DataStudio.Tables.header().icon("ellipsis"),
    overviewTab: () => DataStudio.Tables.header().findByText("Overview"),
    fieldsTab: () => DataStudio.Tables.header().findByText("Fields"),
    dependenciesTab: () =>
      DataStudio.Tables.header().findByText("Dependencies"),
    visitOverviewPage: (tableId: TableId) =>
      cy.visit(`/data-studio/modeling/tables/${tableId}`),
    moreMenuViewTable: () =>
      popover()
        .findByRole("menuitem", { name: /View/ })
        .invoke("removeAttr", "target")
        .click(),

    Overview: {
      descriptionText: () =>
        cy
          .findByTestId("table-description-section")
          .findByTestId("editable-text"),
      descriptionInput: () =>
        cy
          .findByTestId("table-description-section")
          .findByPlaceholderText("No description"),
    },
  },
  Modeling: {
    emptyPage: () =>
      modelingPage().findByText("No tables, metrics, or snippets yet"),
    collectionPage: collectionPage,
    modelingPage,
    collectionTitle: () => collectionPage().findByRole("heading"),
    metricItem: (name: string) =>
      cy.findAllByTestId("metric-name").contains(name),
    modelItem: (name: string) =>
      cy.findAllByTestId("dataset-name").contains(name),
    tableItem: (name: string) =>
      modelingPage().findAllByTestId("table-name").contains(name),
  },
};
