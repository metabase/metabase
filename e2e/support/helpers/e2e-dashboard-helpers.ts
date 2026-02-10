import type {
  DashCardId,
  DashboardCard,
  DashboardId,
  DashboardTab,
  VirtualDashboardCard,
  WritebackActionId,
} from "metabase-types/api";

import { visitDashboard } from "./e2e-misc-helpers";
import {
  filterWidget,
  menu,
  popover,
  sidebar,
  sidesheet,
} from "./e2e-ui-elements-helpers";

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
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return getDashboardCards().eq(index);
}

export function ensureDashboardCardHasText(text: string, index = 0) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByTestId("dashcard").eq(index).should("contain", text);
}

export function getEmbeddedDashboardCardMenu(index = 0) {
  return getDashboardCard(index).findByTestId(
    "public-or-embedded-dashcard-menu",
  );
}

export function getDashboardCardMenu(index = 0) {
  return getDashboardCard(index).findByTestId("dashcard-menu");
}

export function showDashboardCardActions(index = 0) {
  return getDashboardCard(index).realHover({ scrollBehavior: "bottom" });
}

export function removeDashboardCard(index = 0) {
  getDashboardCard(index)
    .realHover()
    .findByTestId("dashboardcard-actions-panel")
    .should("be.visible")
    .icon("close")
    .click({ force: true });
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
  cy.intercept("PUT", "/api/dashboard/*").as(
    "saveDashboard-saveDashboardCards",
  );
  cy.intercept("GET", "/api/dashboard/*").as("saveDashboard-getDashboard");
  cy.intercept("GET", "/api/dashboard/*/query_metadata*").as(
    "saveDashboard-getDashboardMetadata",
  );

  cy.findByText(editBarText).should("be.visible");
  cy.button(buttonLabel).click();

  if (awaitRequest) {
    cy.wait("@saveDashboard-saveDashboardCards");
    cy.wait("@saveDashboard-getDashboard");
    cy.wait("@saveDashboard-getDashboardMetadata");
  }

  cy.findByText(editBarText).should("not.exist");
  cy.wait(waitMs); // this is stupid but necessary to due to the dashboard resizing and detaching elements
}

export function checkFilterLabelAndValue(label: string, value: string) {
  filterWidget().findByLabelText(label, { exact: false }).should("exist");
  filterWidget().contains(value);
}

function _setFilter(type: string, subType?: string, name?: string) {
  popover().findByText("Add a filter or parameter").should("be.visible");
  popover().findByText(type).click();

  if (subType) {
    sidebar().findByText("Filter operator").next().click();
    cy.findByRole("listbox").findByText(subType).click();
  }

  if (name) {
    sidebar().findByLabelText("Label").clear().type(name);
  }
}

export function setFilter(type: string, subType?: string, name?: string) {
  dashboardHeader().findByLabelText("Add a filter or parameter").click();
  _setFilter(type, subType, name);
}

export function setDashCardFilter(
  dashcardIndex: number,
  type: string,
  subType?: string,
  name?: string,
) {
  getDashboardCard(dashcardIndex)
    .realHover({ scrollBehavior: "bottom" })
    .findByLabelText("Add a filter")
    .click({ force: true });
  _setFilter(type, subType, name);
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
  text: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  cy.findByLabelText("Edit dashboard").click();
  addTextBoxWhileEditing(text, options);
}

export function addLinkWhileEditing(
  url: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  cy.findByLabelText("Add a link or iframe").click();
  popover().findByText("Link").click();
  cy.findByPlaceholderText("https://example.com").type(url, options);
}

export function addIFrameWhileEditing(
  embed: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  cy.findByLabelText("Add a link or iframe").click();
  popover().findByText("Iframe").click();
  cy.findByTestId("iframe-card-input").type(embed, options);
}

export function editIFrameWhileEditing(
  dashcardIndex = 0,
  embed: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  getDashboardCard(dashcardIndex)
    .realHover()
    .findByTestId("dashboardcard-actions-panel")
    .should("be.visible")
    .icon("pencil")
    .click();
  cy.findByTestId("iframe-card-input").type(`{selectall}${embed}`, options);
}

export function addTextBoxWhileEditing(
  text: string,
  options: Partial<Cypress.TypeOptions> = {},
) {
  cy.findByLabelText("Add a heading or text box").click();
  popover().findByText("Text").click();
  cy.findByPlaceholderText(
    "You can use Markdown here, and include variables {{like_this}}",
  ).type(text, options);
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
  cy.findByPlaceholderText(
    "You can connect widgets to {{variables}} in heading cards.",
  ).type(string, options);
}

export function openQuestionsSidebar() {
  dashboardHeader().findByLabelText("Add questions").click();
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

export function renameTab(tabName: string, newTabName: string) {
  cy.findByRole("tab", { name: tabName }).findByRole("button").click();
  popover().within(() => {
    cy.findByText("Rename").click();
  });
  cy.findByRole("tab", { name: tabName }).type(newTabName + "{Enter}");
}

export function goToTab(tabName: string) {
  cy.findByRole("tab", { name: tabName }).click();
}

export function assertTabSelected(tabName: string) {
  cy.findByRole("tab", { name: tabName }).should(
    "have.attr",
    "aria-selected",
    "true",
  );
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
    cy.get(".react-resizable-handle")
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

/** Opens the dashboard info sidesheet */
export function openDashboardInfoSidebar() {
  dashboardHeader().findByLabelText("More info").click();
  return sidesheet();
}
/** Closes the dashboard info sidesheet */
export function closeDashboardInfoSidebar() {
  sidesheet().findByLabelText("Close").click();
}
export const openDashboardSettingsSidebar = () => {
  dashboardHeader().icon("ellipsis").click();
  popover().findByText("Edit settings").click();
};
export const closeDashboardSettingsSidebar = () => {
  sidesheet().findByLabelText("Close").click();
};

export function openDashboardMenu(option?: string) {
  dashboardHeader().findByLabelText("Move, trash, and more…").click();

  if (option) {
    popover().findByText(option).click();
  }
}

export function assertDashboardCardTitle(index: number, title: string) {
  getDashboardCard(index)
    .findByTestId("legend-caption-title")
    .should("have.text", title);
}

export function clickOnCardTitle(index: number) {
  getDashboardCard(index).findByTestId("legend-caption-title").click();
}

export const dashboardHeader = () => {
  return cy.findByTestId("dashboard-header");
};

export const dashboardGrid = () => {
  return cy.findByTestId("dashboard-grid");
};

export function dashboardCancelButton() {
  return cy.findByTestId("edit-bar").findByRole("button", { name: "Cancel" });
}

export function dashboardSaveButton() {
  return cy.findByTestId("edit-bar").findByRole("button", { name: "Save" });
}

export function dashboardParameterSidebar() {
  return cy.findByTestId("dashboard-parameter-sidebar");
}

export function applyFilterToast() {
  return cy.findByTestId("filter-apply-toast");
}

export function applyFilterButton() {
  return applyFilterToast().button("Apply");
}

export function cancelFilterButton() {
  return applyFilterToast().button("Cancel");
}

export function setDashboardParameterName(name: string) {
  dashboardParameterSidebar().findByLabelText("Label").clear().type(name);
}

export function setDashboardParameterType(type: string) {
  dashboardParameterSidebar()
    .findByText("Filter or parameter type")
    .next()
    .click();
  popover().findByText(type).click();
}

export function setDashboardParameterOperator(operatorName: string) {
  dashboardParameterSidebar().findByText("Filter operator").next().click();
  popover().findByText(operatorName).click();
}

export function dashboardParametersDoneButton() {
  return dashboardParameterSidebar().button("Done");
}

export function dashboardParametersPopover() {
  return popover({ testId: "parameter-value-dropdown" } as any);
}

export function getTextCardDetails({
  id = getNextUnsavedDashboardCardId(),
  col = 0,
  row = 0,
  size_x = 4,
  size_y = 6,
  text = "Text card",
  ...cardDetails
}: Partial<VirtualDashboardCard> & {
  text?: string;
} = {}): Partial<VirtualDashboardCard> {
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
    ...cardDetails,
  };
}
export function getDashboardTabDetails({
  id,
  name,
}: Pick<DashboardTab, "id" | "name" | "position">): Pick<
  DashboardTab,
  "id" | "name" | "position"
> {
  return {
    id,
    name,
  };
}

export function getHeadingCardDetails({
  id = getNextUnsavedDashboardCardId(),
  col = 0,
  row = 0,
  size_x = 24,
  size_y = 1,
  text = "Heading text details",
  ...cardDetails
}: Partial<VirtualDashboardCard> & {
  text?: string;
} = {}): Partial<VirtualDashboardCard> {
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
    ...cardDetails,
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

export function clickBehaviorSidebar(
  dashcardIndex = 0,
): Cypress.Chainable<JQuery<HTMLElement>> {
  showDashboardCardActions(dashcardIndex);

  getDashboardCard(dashcardIndex)
    .findByLabelText("Click behavior")
    .click({ force: true });

  return cy.findByTestId("click-behavior-sidebar");
}
