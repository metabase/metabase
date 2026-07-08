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
  cy.log("Wait for the card results to load");
  getDashboardCard(index).findByTestId("loading-indicator").should("not.exist");
  cy.log("Click on the card menu");
  return getDashboardCard(index).findByTestId("dashcard-menu");
}

/**
 * Wait until every dashcard in the grid has finished loading its results.
 *
 * Prefer this over counting card-query requests: how many queries fire after a
 * save, filter change, or navigation is not deterministic (results can be served
 * from cache), but the absence of loading indicators is a stable signal that the
 * grid has settled. Pass `count` to also assert the expected number of cards is
 * present, which guards against the check passing before the cards render.
 *
 * Anchors on the dashboard body being visible before checking for spinners so
 * the absence check can't pass mid-render, before any cards have started
 * loading. The body container renders even for empty dashboards (which show no
 * grid), so this stays a no-op rather than hanging when there is no grid.
 */
export function waitForDashcardsToLoad({ count }: { count?: number } = {}) {
  cy.log("Wait for all dashcards to finish loading");
  if (count != null) {
    getDashboardCards().should("have.length", count);
  }
  cy.findByTestId("dashboard-parameters-and-cards")
    .should("be.visible")
    .findAllByTestId("loading-indicator")
    .should("not.exist");
  waitForGridLayoutStable();
  waitForFilterWidgetsStable();
}

/**
 * Wait until the grid stops reflowing. react-grid-layout repositions cards when
 * switching between edit and view mode (the "resizing and detaching elements"
 * the old fixed sleeps compensated for), which can move a chart out from under a
 * coordinate-based click. No-op when there are no cards to reflow (empty or
 * text-only dashboards).
 */
function waitForGridLayoutStable() {
  waitForLayoutStable(
    "dashcard-container",
    () => getDashboardCards(),
    "dashcard",
  );
}

/**
 * Wait until the filter widgets stop re-rendering. The parameter panel re-mounts
 * when leaving edit mode, so interacting with a widget too soon after a save can
 * hit a detaching element and drop the click. No-op when the dashboard has no
 * filter widgets.
 */
export function waitForFilterWidgetsStable() {
  waitForLayoutStable(
    "parameter-widget",
    () => cy.findAllByTestId("parameter-widget"),
    "filter widget",
  );
}

/**
 * Poll the first matching element's box until it is unchanged across consecutive
 * retries, i.e. layout has settled. There's no "layout done" event to await, and
 * this is a no-op when nothing matches so it never hangs on absent elements.
 */
function waitForLayoutStable(
  testId: string,
  getElements: () => Cypress.Chainable<JQuery<HTMLElement>>,
  label: string,
) {
  cy.get("body").then(($body) => {
    if (!$body.find(`[data-testid="${testId}"]`).length) {
      return;
    }
    let previous: string | null = null;
    getElements()
      .first()
      .should(($el) => {
        const { top, left, width, height } = $el[0].getBoundingClientRect();
        const current = [top, left, width, height].map(Math.round).join(",");
        const settled = current === previous;
        previous = current;
        expect(settled, `${label} layout settled (${current})`).to.be.true;
      });
  });
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
  // The click can be dropped while the header is still re-rendering (e.g. right
  // after a save). The Edit button only exists in view mode, so if it's still
  // present the click didn't take — re-click it. This can't double-toggle.
  // Use cy.document() (not cy.get("body")) so this also works when editDashboard
  // runs inside a cy.within() block, where cy.get is scoped to the subject.
  cy.document().then((doc) => {
    if (doc.querySelector('[aria-label="Edit dashboard"]')) {
      cy.findByLabelText("Edit dashboard").click();
    }
  });
  cy.findByText("You're editing this dashboard.");
}

export function saveDashboard({
  awaitRequest = true,
}: { awaitRequest?: boolean } = {}) {
  cy.intercept("PUT", "/api/dashboard/*").as(
    "saveDashboard-saveDashboardCards",
  );
  cy.intercept("GET", "/api/dashboard/*/query_metadata*").as(
    "saveDashboard-getDashboardMetadata",
  );

  cy.findByTestId("edit-bar").should("be.visible");
  cy.findByTestId("edit-bar").findByTestId("save-edit-button").click();

  if (awaitRequest) {
    cy.wait("@saveDashboard-saveDashboardCards");
    cy.wait("@saveDashboard-getDashboardMetadata");
  }

  cy.findByTestId("edit-bar").should("not.exist");
  // Settle on a deterministic signal (all dashcards loaded) instead of sleeping
  // for a fixed time while the grid resizes and detaches elements.
  waitForDashcardsToLoad();
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
