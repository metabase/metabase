import type { MeasureId, SegmentId, TableId } from "metabase-types/api";

import { codeMirrorHelpers } from "./e2e-codemirror-helpers";
import { popover } from "./e2e-ui-elements-helpers";
const { H } = cy;

const libraryPage = () => cy.findByTestId("library-page");
const newSnippetPage = () => cy.findByTestId("new-snippet-page");
const editSnippetPage = () => cy.findByTestId("edit-snippet-page");
const metricOverviewPage = () => cy.findByTestId("metric-overview-page");
const metricQueryEditor = () => cy.findByTestId("metric-query-editor");

export const DataStudio = {
  nav: () => cy.findByTestId("data-studio-nav"),
  breadcrumbs: () => cy.findByTestId("data-studio-breadcrumbs"),
  Transforms: {
    header: () => cy.findByTestId("transforms-header"),
    list: () => cy.findByTestId("transforms-list"),
    saveChangesButton: () => DataStudio.Transforms.queryEditor().button("Save"),
    editDefinition: () => cy.findByRole("link", { name: "Edit definition" }),
    queryEditor: () => cy.findByTestId("transform-query-editor"),
    runTab: () => DataStudio.Transforms.header().findByText("Run"),
    settingsTab: () => DataStudio.Transforms.header().findByText("Settings"),
    dependenciesTab: () =>
      DataStudio.Transforms.header().findByText("Dependencies"),
  },
  Jobs: {
    header: () => cy.findByTestId("jobs-header"),
    list: () => cy.findByTestId("transforms-job-list"),
    editor: () => cy.findByTestId("transforms-job-editor"),
  },
  Runs: {
    list: () => cy.findByTestId("transforms-run-list"),
    content: () => cy.findByTestId("transforms-run-content"),
  },
  Dependencies: {
    content: () => cy.findByTestId("transforms-dependencies-content"),
    graph: () => cy.findByTestId("dependency-graph"),
  },
  PythonLibrary: {
    header: () => cy.findByTestId("python-library-header"),
    editor: () => cy.findByTestId("python-editor"),
  },
  Snippets: {
    newPage: newSnippetPage,
    editPage: editSnippetPage,
    nameInput: () => newSnippetPage().findByDisplayValue("New SQL snippet"),
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
    cachingTab: () => DataStudio.Metrics.header().findByText("Caching"),
  },
  Tables: {
    overviewPage: () => cy.findByTestId("table-overview-page"),
    fieldsPage: () => cy.findByTestId("table-fields-page"),
    dependenciesPage: () => cy.findByTestId("table-dependencies-page"),
    segmentsPage: () => cy.findByTestId("table-segments-page"),
    measuresPage: () => cy.findByTestId("table-measures-page"),
    header: () => cy.findByTestId("table-pane-header"),
    nameInput: () => cy.findByTestId("table-name-input"),
    moreMenu: () => DataStudio.Tables.header().icon("ellipsis"),
    overviewTab: () => DataStudio.Tables.header().findByText("Overview"),
    fieldsTab: () => DataStudio.Tables.header().findByText("Fields"),
    segmentsTab: () => DataStudio.Tables.header().findByText("Segments"),
    measuresTab: () => DataStudio.Tables.header().findByText("Measures"),
    dependenciesTab: () =>
      DataStudio.Tables.header().findByText("Dependencies"),
    visitOverviewPage: (tableId: TableId) =>
      cy.visit(`/data-studio/library/tables/${tableId}`),
    visitFieldsPage: (tableId: TableId) =>
      cy.visit(`/data-studio/library/tables/${tableId}/fields`),
    visitSegmentsPage: (tableId: TableId) =>
      cy.visit(`/data-studio/library/tables/${tableId}/segments`),
    visitSegmentPage: (tableId: TableId, segmentId: SegmentId) =>
      cy.visit(`/data-studio/library/tables/${tableId}/segments/${segmentId}`),
    visitNewSegmentPage: (tableId: TableId) =>
      cy.visit(`/data-studio/library/tables/${tableId}/segments/new`),
    visitMeasuresPage: (tableId: TableId) =>
      cy.visit(`/data-studio/library/tables/${tableId}/measures`),
    visitMeasurePage: (tableId: TableId, measureId: MeasureId) =>
      cy.visit(`/data-studio/library/tables/${tableId}/measures/${measureId}`),
    visitNewMeasurePage: (tableId: TableId) =>
      cy.visit(`/data-studio/library/tables/${tableId}/measures/new`),
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
    openFilterPopover: () => {
      cy.findByRole("button", { name: "Filter" }).click();
      H.popover();
    },
  },
  Library: {
    visit: () => {
      cy.visit("/data-studio/library");
      DataStudio.Library.libraryPage().should("be.visible");
    },
    noResults: () =>
      libraryPage().findByText("No tables, metrics, or snippets yet"),
    libraryPage,
    metricItem: (name: string) =>
      cy.findAllByTestId("metric-name").contains(name),
    allTableItems: () => libraryPage().findAllByTestId("table-name"),
    tableItem: (name: string) =>
      DataStudio.Library.allTableItems().contains(name),
    result: (name: string) =>
      libraryPage().findByText(name).closest('[role="row"]'),
    newButton: () => libraryPage().findByRole("button", { name: /New/ }),
    collectionItem: (name: string) =>
      libraryPage().findAllByTestId("collection-name").contains(name),
  },
};
