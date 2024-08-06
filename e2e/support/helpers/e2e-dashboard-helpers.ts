import type {
  DashboardCard,
  DashboardId,
  DashCardId,
  WritebackActionId,
} from "metabase-types/api";

import { visitDashboard } from "./e2e-misc-helpers";
import { menu, popover, sidebar } from "./e2e-ui-elements-helpers";

// Metabase utility functions for commonly-used patterns
export function selectDashboardFilter(
  selection: Cypress.Chainable<JQuery<HTMLElement>>,
  filterName: string,
) {
  selection.contains("Select…").click();
  popover().contains(filterName).click({ force: true });
}

export function disconnectDashboardFilter(
  selection: Cypress.Chainable<JQuery<HTMLElement>>,
) {
  selection.findByLabelText("Disconnect").click();
}

export function getDashboardCards() {
  return cy.findAllByTestId("dashcard-container");
}

export function getDashboardCard(index = 0) {
  return getDashboardCards().eq(index);
}

export function ensureDashboardCardHasText(text: string, index = 0) {
  cy.findAllByTestId("dashcard").eq(index).should("contain", text);
}

export function getDashboardCardMenu(index = 0) {
  return getDashboardCard(index).findByTestId("dashcard-menu");
}

export function showDashboardCardActions(index = 0) {
  getDashboardCard(index).realHover({ scrollBehavior: "bottom" });
}

/**
 * Given a dashcard HTML element, will return the element for the action icon
 * with the given label text (e.g. "Click behavior", "Replace", "Duplicate", etc)
 */
export function findDashCardAction(
  dashcardElement: Cypress.Chainable<JQuery<HTMLElement>>,
  labelText: string,
) {
  return dashcardElement
    .realHover({ scrollBehavior: "bottom" })
    .findByLabelText(labelText);
}

export function removeDashboardCard(index = 0) {
  getDashboardCard(index)
    .realHover()
    .findByTestId("dashboardcard-actions-panel")
    .should("be.visible")
    .icon("close")
    .click();
}

export function showDashcardVisualizationSettings(index = 0) {
  return getDashboardCard(index)
    .realHover()
    .within(() => {
      cy.findByLabelText("Show visualization options").click();
    });
}

export function editDashboard() {
  cy.findByLabelText("Edit dashboard").click();
  cy.findByText("You're editing this dashboard.");
}

export function saveDashboard({
  buttonLabel = "Save",
  editBarText = "You're editing this dashboard.",
  waitMs = 1,
  awaitRequest = true,
} = {}) {
  cy.intercept("PUT", "/api/dashboard/*").as("saveDashboardCards");
  cy.button(buttonLabel).click();

  if (awaitRequest) {
    cy.wait("@saveDashboardCards").then(() => {
      cy.findByText(editBarText).should("not.exist");
    });
  } else {
    cy.findByText(editBarText).should("not.exist");
  }
  cy.wait(waitMs); // this is stupid but necessary to due to the dashboard resizing and detaching elements
}

export function checkFilterLabelAndValue(label: string, value: string) {
  cy.get("fieldset").find("legend").invoke("text").should("eq", label);

  cy.get("fieldset").contains(value);
}

export function setFilter(type: string, subType: string, name: string) {
  cy.icon("filter").click();

  cy.findByText("What do you want to filter?");

  popover().findByText(type).click();

  if (subType) {
    sidebar().findByText("Filter operator").next().click();
    popover().findByText(subType).click();
  }

  if (name) {
    sidebar().findByLabelText("Label").clear().type(name);
  }
}

export function getRequiredToggle() {
  return cy.findByLabelText("Always require a value");
}

export function toggleRequiredParameter() {
  // We need force: true because the actual input is hidden in Mantine
  getRequiredToggle().click({ force: true });
}

export function createEmptyTextBox() {
  cy.findByLabelText("Edit dashboard").click();
  cy.findByLabelText("Add a heading or text box").click();
  popover().findByText("Text").click();
}

export function addTextBox(
  string: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  cy.findByLabelText("Edit dashboard").click();
  addTextBoxWhileEditing(string, options);
}

export function addLinkWhileEditing(
  string: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  cy.findByLabelText("Add link card").click();
  cy.findByPlaceholderText("https://example.com").type(string, options);
}

export function addTextBoxWhileEditing(
  string: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  cy.findByLabelText("Add a heading or text box").click();
  popover().findByText("Text").click();
  cy.findByPlaceholderText(
    "You can use Markdown here, and include variables {{like_this}}",
  ).type(string, options);
}

export function createEmptyHeading() {
  cy.findByLabelText("Edit dashboard").click();
  cy.findByLabelText("Add a heading or text box").click();
  popover().findByText("Heading").click();
}

export function addHeading(
  string: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  cy.findByLabelText("Edit dashboard").click();
  addHeadingWhileEditing(string, options);
}

export function addHeadingWhileEditing(
  string: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  cy.findByLabelText("Add a heading or text box").click();
  popover().findByText("Heading").click();
  cy.findByPlaceholderText("Heading").type(string, options);
}

export function openQuestionsSidebar() {
  cy.findByTestId("dashboard-header").findByLabelText("Add questions").click();
}

export function createNewTab() {
  cy.findByLabelText("Create new tab").click();
}

export function deleteTab(tabName: string) {
  cy.findByRole("tab", { name: tabName }).findByRole("button").click();
  popover().within(() => {
    cy.findByText("Delete").click();
  });
}

export function duplicateTab(tabName: string) {
  cy.findByRole("tab", { name: tabName }).findByRole("button").click();
  popover().within(() => {
    cy.findByText("Duplicate").click();
  });
}

export function goToTab(tabName: string) {
  cy.findByRole("tab", { name: tabName }).click();
}

export function moveDashCardToTab({
  dashcardIndex = 0,
  tabName,
}: {
  dashcardIndex?: number;
  tabName: string;
}) {
  getDashboardCard(dashcardIndex).realHover().icon("move_card").realHover();
  menu().findByText(tabName).click();
}

export function visitDashboardAndCreateTab({
  dashboardId,
  save = true,
}: {
  dashboardId: DashboardId;
  save?: boolean;
}) {
  visitDashboard(dashboardId);
  editDashboard();
  createNewTab();
  if (save) {
    saveDashboard();
  }
}

export function resizeDashboardCard({
  card,
  x,
  y,
}: {
  card: Cypress.Chainable<JQuery<HTMLElement>>;
  x: number;
  y: number;
}) {
  card.within(() => {
    const resizeHandle = cy.get(".react-resizable-handle");
    resizeHandle
      .trigger("mousedown", { button: 0 })
      .wait(200)
      .trigger("mousemove", {
        clientX: x,
        clientY: y,
      })
      .wait(200)
      .trigger("mouseup", { force: true })
      .wait(200);
  });
}

export function toggleDashboardInfoSidebar() {
  dashboardHeader().icon("info").click();
}

export function openDashboardMenu() {
  dashboardHeader().findByLabelText("Move, trash, and more…").click();
}

export const dashboardHeader = () => {
  return cy.findByTestId("dashboard-header");
};

export const dashboardGrid = () => {
  return cy.findByTestId("dashboard-grid");
};

export function dashboardSaveButton() {
  return cy.findByTestId("edit-bar").findByRole("button", { name: "Save" });
}

export function dashboardParameterSidebar() {
  return cy.findByTestId("dashboard-parameter-sidebar");
}

export function dashboardParametersDoneButton() {
  return dashboardParameterSidebar().button("Done");
}

/**
 * @param {Object} option
 * @param {number=} option.id
 * @param {number=} option.col
 * @param {number=} option.row
 * @param {number=} option.size_x
 * @param {number=} option.size_y
 * @param {string=} option.text
 */
export function getTextCardDetails({
  id = getNextUnsavedDashboardCardId(),
  col = 0,
  row = 0,
  size_x = 4,
  size_y = 6,
  text = "Text card",
} = {}) {
  return {
    id,
    card_id: null,
    col,
    row,
    size_x,
    size_y,
    visualization_settings: {
      virtual_card: {
        name: null,
        display: "text",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      text,
    },
  };
}

export function getHeadingCardDetails({
  id = getNextUnsavedDashboardCardId(),
  col = 0,
  row = 0,
  size_x = 24,
  size_y = 1,
  text = "Heading text details",
} = {}) {
  return {
    id,
    card_id: null,
    col,
    row,
    size_x,
    size_y,
    visualization_settings: {
      virtual_card: {
        name: null,
        display: "heading",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      "dashcard.background": false,
      text,
    },
  };
}

export function getLinkCardDetails({
  id = getNextUnsavedDashboardCardId(),
  col = 0,
  row = 0,
  size_x = 4,
  size_y = 1,
  url = "https://metabase.com",
} = {}) {
  return {
    id,
    card_id: null,
    col,
    row,
    size_x,
    size_y,
    visualization_settings: {
      virtual_card: {
        name: null,
        display: "link",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      link: {
        url,
      },
    },
    parameter_mappings: [],
  };
}

/**
 * @param {Object} option
 * @param {number=} option.col
 * @param {number=} option.row
 * @param {string=} option.label
 * @param {number=} option.action_id
 * @param {Array=} option.parameter_mappings
 */
export function getActionCardDetails({
  id = getNextUnsavedDashboardCardId(),
  col = 0,
  row = 0,
  label = "Action card",
  action_id,
  parameter_mappings,
}: {
  id?: DashCardId;
  col?: number;
  row?: number;
  label?: string;
  action_id?: WritebackActionId;
  parameter_mappings?: DashboardCard["parameter_mappings"];
} = {}) {
  return {
    id,
    action_id,
    card_id: null,
    col,
    row,
    size_x: 4,
    size_y: 1,
    series: [],
    parameter_mappings,
    visualization_settings: {
      actionDisplayType: "button",
      virtual_card: {
        name: null,
        display: "action",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      "button.label": label,
    },
  };
}

export const getNextUnsavedDashboardCardId = (() => {
  let id = 0;
  return () => --id;
})();

const MAX_WIDTH = "1048px";
export function assertDashboardFixedWidth() {
  cy.findByTestId("fixed-width-dashboard-header").should(
    "have.css",
    "max-width",
    MAX_WIDTH,
  );
  cy.findByTestId("fixed-width-dashboard-tabs").should(
    "have.css",
    "max-width",
    MAX_WIDTH,
  );
  cy.findByTestId("fixed-width-filters").should(
    "have.css",
    "max-width",
    MAX_WIDTH,
  );
  cy.findByTestId("dashboard-grid").should("have.css", "max-width", MAX_WIDTH);
}

export function assertDashboardFullWidth() {
  cy.findByTestId("fixed-width-dashboard-header").should(
    "not.have.css",
    "max-width",
    MAX_WIDTH,
  );
  cy.findByTestId("fixed-width-dashboard-tabs").should(
    "not.have.css",
    "max-width",
    MAX_WIDTH,
  );
  cy.findByTestId("fixed-width-filters").should(
    "not.have.css",
    "max-width",
    MAX_WIDTH,
  );
  cy.findByTestId("dashboard-grid").should(
    "not.have.css",
    "max-width",
    MAX_WIDTH,
  );
}
