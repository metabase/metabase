// Functions that get key elements in the app
import { dashboardParameterSidebar } from "./e2e-dashboard-helpers";

export const POPOVER_ELEMENT =
  ".popover[data-state~='visible'],[data-element-id=mantine-popover]";

export function popover({ testId, skipVisibilityCheck = false } = {}) {
  const selector = `${POPOVER_ELEMENT}${testId ? `[data-testid=${testId}]` : ""}`;

  if (skipVisibilityCheck) {
    return cy.get(selector);
  }

  return cy.get(selector).filter(":visible").should("be.visible");
}

const HOVERCARD_ELEMENT =
  ".mb-mantine-HoverCard-dropdown[role='dialog']:visible";

export function hovercard() {
  cy.get(HOVERCARD_ELEMENT, { timeout: 6000 }).should("be.visible");
  return cy.get(HOVERCARD_ELEMENT);
}

export function main() {
  return cy.get("main");
}

export function menu() {
  return cy.findByRole("menu");
}

export function modal(options = {}) {
  const MODAL_SELECTOR = ".mb-mantine-Modal-content[role='dialog']";
  const LEGACY_MODAL_SELECTOR = "[data-testid=modal]";
  return cy.get([MODAL_SELECTOR, LEGACY_MODAL_SELECTOR].join(","), options);
}

export function tooltip() {
  return cy.get(".mb-mantine-Tooltip-tooltip, [role='tooltip']");
}

export function selectDropdown() {
  return popover().findByRole("listbox");
}

export function miniPicker() {
  return cy.findByTestId("mini-picker");
}

export function miniPickerBrowseAll() {
  return miniPicker().findByText("Browse all");
}

export function miniPickerOurAnalytics() {
  return miniPicker().findByText("Our analytics");
}

export function miniPickerHeader() {
  return cy.findByTestId("mini-picker-header");
}

export function entityPickerModal() {
  return cy.findByTestId("entity-picker-modal");
}

export function entityPickerModalLevel(level) {
  return cy.findByTestId(`item-picker-level-${level}`);
}

/**
 *
 * @param {number} level
 * @param {string | RegExp} name
 */
export function entityPickerModalItem(level, name) {
  return entityPickerModalLevel(level).findByText(name).parents("a");
}

export function entityPickerModalTab(name) {
  return cy.findAllByRole("tab").filter(`:contains(${name})`);
}

// displays at least these tabs:
export function shouldDisplayTabs(tabs) {
  tabs.forEach((tab) => {
    entityPickerModalTab(tab).should("exist");
  });
}

export function tabsShouldBe(selected, tabs) {
  cy.log(tabs);
  cy.findAllByRole("tab").should("have.length", tabs.length);
  tabs.forEach((tab) => {
    if (tab === selected) {
      entityPickerModalTab(tab).and("have.attr", "aria-selected", "true");
    } else {
      entityPickerModalTab(tab).should("exist");
    }
  });
}

export function collectionOnTheGoModal() {
  return cy.findByTestId("create-collection-on-the-go");
}

export function dashboardOnTheGoModal() {
  return cy.findByTestId("create-dashboard-on-the-go");
}

export function sidebar() {
  return cy.get("main aside");
}

export function rightSidebar() {
  return cy.findByTestId("sidebar-right");
}

export function leftSidebar() {
  return cy.findByTestId("sidebar-left");
}

export function sidesheet() {
  return cy.findByTestId("sidesheet");
}

export function navigationSidebar() {
  return cy.findByTestId("main-navbar-root");
}

export function assertNavigationSidebarItemSelected(name, value = "true") {
  navigationSidebar()
    .findByRole("treeitem", { name })
    .should("have.attr", "aria-selected", value);
}

export function assertNavigationSidebarBookmarkSelected(name, value = "true") {
  navigationSidebar()
    .findByRole("section", { name: "Bookmarks" })
    .findByRole("listitem", { name })
    .should("have.attr", "aria-selected", value);
}

export function appBar() {
  return cy.findByLabelText("Navigation bar");
}

export function openNavigationSidebar() {
  appBar().findByTestId("sidebar-toggle").click();
  navigationSidebar().should("be.visible");
}

export function closeNavigationSidebar() {
  appBar().findByTestId("sidebar-toggle").click();
  navigationSidebar().should("not.be.visible");
}

export function browseDatabases() {
  return navigationSidebar().findByLabelText("Browse databases");
}

export function notificationList() {
  return cy.findByRole("list", { name: "undo-list" });
}

/**
 * Get the `fieldset` HTML element that we use as a filter widget container.
 *
 * @param {Object} options
 * @param {boolean} [options.isEditing] - whether dashboard editing mode is enabled
 * @param {string} [options.name] - the name of the filter widget to get
 *
 * @returns HTMLFieldSetElement
 *
 * @example
 * // Simple SQL filter widget (works for "Text" and "Number" SQL variable types)
 * filterWidget().type("123");
 *
 * @example
 * // Filter widget that opens some other type of a filter picker (search, dropdown, input)
 * filterWidget()
 *  .contains("Search")
 *  .click();
 *
 * @todo Add the ability to choose between multiple widgets using their index.
 * @todo Add the ability to alias the chosen filter widget.
 * @todo Extract into a separate helper file.
 */
export function filterWidget({ isEditing = false, name = null } = {}) {
  const selector = isEditing ? "editing-parameter-widget" : "parameter-widget";

  return name != null
    ? cy.findAllByTestId(selector).filter(`:contains(${name})`)
    : cy.findAllByTestId(selector);
}

export function clearFilterWidget(index = 0) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return filterWidget().eq(index).icon("close").click();
}

export function resetFilterWidgetToDefault(index = 0) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return filterWidget().eq(index).icon("revert").click();
}

export function setFilterWidgetValue(
  value,
  targetPlaceholder,
  { buttonLabel = "Update filter" } = {},
) {
  filterWidget().eq(0).click();
  popover()
    .first()
    .within(() => {
      removeFieldValuesValue(0);
      if (value) {
        cy.findByPlaceholderText(targetPlaceholder).type(value).blur();
      }
      cy.button(buttonLabel).click({ force: true });
    });
}

export function toggleFilterWidgetValues(
  values = [],
  { buttonLabel = "Add filter" } = {},
) {
  filterWidget().eq(0).click();

  popover().within(() => {
    values.forEach((value) => cy.findByText(value).click());
    cy.button(buttonLabel).click();
  });
}

/**
 * Moves a dashboard filter to a dashcard / top nav
 * (it must be in 'editing' mode prior to that)
 */
export function moveDashboardFilter(destination, { showFilter = false } = {}) {
  dashboardParameterSidebar().findByPlaceholderText("Move filter").click();
  popover().findByText(destination).click();
  if (showFilter) {
    undoToast().button("Show filter").click();
  }
}

export const openQuestionActions = (action) => {
  cy.findByTestId("qb-header-action-panel").icon("ellipsis").click();

  if (action) {
    popover().findByText(action).click();
  }
};

export const collectionTable = () => {
  return cy.findByTestId("collection-table");
};

export const queryBuilderHeader = () => {
  return cy.findByTestId("qb-header");
};

export const queryBuilderFiltersPanel = () => {
  return cy.findByTestId("qb-filters-panel");
};

export const queryBuilderFooter = () => {
  return cy.findByTestId("view-footer");
};

export const queryBuilderFooterDisplayToggle = () => {
  return cy.findByTestId("query-display-tabular-toggle");
};

export const queryVisualizationRoot = () => {
  return cy.findByTestId("query-visualization-root");
};

export const closeQuestionActions = () => {
  queryBuilderHeader().click();
};

export const questionInfoButton = () => {
  return cy.findByTestId("qb-header-info-button");
};

/** Opens the question info sidesheet */
export const openQuestionInfoSidesheet = () => {
  questionInfoButton().click();
  return sidesheet();
};

export const undo = () => {
  cy.findByTestId("toast-undo").findByText("Undo").click();
};

export const getDraggableElements = () => {
  return cy.findAllByTestId(/draggable-item/);
};

export const moveColumnDown = (column, distance) => {
  column
    .trigger("mousedown", 0, 0, { force: true })
    .trigger("mousemove", 5, 5, { force: true })
    .trigger("mousemove", 0, distance * 50, { force: true })
    .trigger("mouseup", 0, distance * 50, { force: true });
};

/**
 * Moves an element within a dnd-kit sortable list from one position to another.
 *
 * @param {string | RegExp} dataTestId - The data-testid pattern to match list elements
 * @param {Object} options
 * @param {number} options.startIndex - The index of the element to drag
 * @param {number} options.dropIndex - The index where the element should be dropped
 * @param {Function} [options.onBeforeDragEnd] - Optional callback executed before releasing the drag
 */
export const moveDnDKitListElement = (
  dataTestId,
  { startIndex, dropIndex, onBeforeDragEnd = () => {} } = {},
) => {
  const selector = new RegExp(dataTestId);

  const getCenter = ($el) => {
    const { x, y, width, height } = $el.getBoundingClientRect();

    return { clientX: x + width / 2, clientY: y + height / 2 };
  };

  cy.findAllByTestId(selector).then(($all) => {
    const dragEl = $all.get(startIndex);
    const dropEl = $all.get(dropIndex);
    const dragPoint = getCenter(dragEl);
    const dropPoint = getCenter(dropEl);

    cy.wrap(dragEl).as("dragElement");

    moveDnDKitElementByAlias("@dragElement", {
      vertical: dropPoint.clientY - dragPoint.clientY,
      horizontal: dropPoint.clientX - dragPoint.clientX,
      onBeforeDragEnd,
    });
  });
};

/**
 * Moves a dnd-kit draggable element by a specified offset using a Cypress alias.
 *
 * @param {string} alias - The Cypress alias for the element to drag (e.g., "@dragElement")
 * @param {Object} options
 * @param {number} [options.horizontal=0] - Horizontal distance to move in pixels
 * @param {number} [options.vertical=0] - Vertical distance to move in pixels
 * @param {Function} [options.onBeforeDragEnd] - Optional callback executed before releasing the drag
 */
export const moveDnDKitElementByAlias = (
  alias,
  { horizontal = 0, vertical = 0, onBeforeDragEnd = () => {} } = {},
) => {
  // This function queries alias before triggering every event to avoid running into "element was removed from the DOM"
  // error caused by node remounting https://on.cypress.io/element-has-detached-from-dom
  cy.get(alias)
    .trigger("pointerdown", 0, 0, {
      force: true,
      isPrimary: true,
      button: 0,
    })
    .wait(200);
  // This initial move needs to be greater than the activation constraint
  // of the pointer sensor
  cy.get(alias)
    .trigger("pointermove", 20, 20, {
      force: true,
      isPrimary: true,
      button: 0,
    })
    .wait(200);
  cy.get(alias)
    .trigger("pointermove", horizontal, vertical, {
      force: true,
      isPrimary: true,
      button: 0,
    })
    .wait(200);

  onBeforeDragEnd();

  cy.document()
    .trigger("pointerup", {
      force: true,
      isPrimary: true,
      button: 0,
    })
    .wait(200);
};

export const queryBuilderMain = () => {
  return cy.findByTestId("query-builder-main");
};

export const dashboardParametersContainer = () => {
  return cy.findByTestId("dashboard-parameters-widget-container");
};

export const editingDashboardParametersContainer = () => {
  return cy.findByTestId("edit-dashboard-parameters-widget-container");
};

export const undoToast = () => {
  return cy.findByTestId("toast-undo");
};

export const undoToastList = () => {
  return cy.findAllByTestId("toast-undo");
};

export const undoToastListContainer = () => {
  return cy.findByTestId("undo-list");
};

export function dashboardCards() {
  return cy.get("[data-element-id=dashboard-cards-container]");
}

export function tableInteractive() {
  return cy.findByTestId("table-root");
}

export function tableInteractiveBody() {
  return cy.findByTestId("table-body");
}

export function tableInteractiveHeader() {
  return cy.findByTestId("table-header");
}

export function tableInteractiveFooter() {
  return cy.findByTestId("table-footer");
}

export function resizeTableColumn(columnId, moveX, elementIndex = 0) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByTestId(`resize-handle-${columnId}`)
    .eq(elementIndex)
    .trigger("mousedown", {
      button: 0,
      clientX: 0,
      clientY: 0,
    });

  cy.get("body")
    .trigger("mousemove", {
      clientX: moveX,
      clientY: 0,
    })
    // UI requires time to update, causes flakiness without the delay
    .wait(100)
    .trigger("mouseup", {
      button: 0,
      clientX: moveX,
      clientY: 0,
    });
}

export function openObjectDetail(rowIndex) {
  cy.get(`[data-index=${rowIndex}]`)
    .realHover({ scrollBehavior: false })
    .findByTestId("detail-shortcut")
    .should("be.visible")
    .click({ force: true });
}

export function tableInteractiveScrollContainer() {
  return cy.findByTestId("table-scroll-container");
}

export function assertTableRowsCount(value) {
  if (value > 0) {
    // Ensure table some rows are rendered although due to virtualization we can't rely on their count
    tableInteractiveBody().findAllByRole("row").should("not.be.empty");
  }
  tableInteractive().should("have.attr", "data-rows-count", String(value));
}

export function lastTableRow() {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return tableInteractiveScrollContainer()
    .scrollTo("bottomLeft")
    .findAllByRole("row")
    .last();
}

export function assertRowHeight(index, height) {
  tableInteractive()
    .find(`[data-index=${index}]`)
    .should("exist")
    .should("have.css", "height", `${height}px`);
}

export function getColumnWidth(columnId) {
  return cy
    .findAllByTestId("header-cell")
    .filter(`:contains(${columnId})`)
    .invoke("width");
}

export function tableAllFieldsHiddenImage() {
  return cy.findByTestId("Table-all-fields-hidden-image");
}

export function tableHeaderColumn(
  headerString,
  { scrollIntoView = true } = {},
) {
  if (scrollIntoView) {
    // Apply horizontal scroll offset when targeting columns to prevent the sticky 'Object detail' column
    // from obscuring the target column in the viewport
    const objectDetailOffset = 50;
    tableInteractiveHeader()
      .findByText(headerString)
      .scrollIntoView({ offset: { left: -objectDetailOffset } });
  }

  return tableInteractiveHeader().findByText(headerString);
}

export function tableHeaderClick(headerString) {
  tableHeaderColumn(headerString).click();
}

export function clickActionsPopover({ skipVisibilityCheck = false } = {}) {
  return popover({ testId: "click-actions-popover", skipVisibilityCheck });
}

export function segmentEditorPopover() {
  return popover({ testId: "segment-popover" });
}

/**
 * @param {Object} params
 * @param {string[]} params.columns
 * @param {string[][]} [params.firstRows=[]]
 */
export function assertTableData({ columns, firstRows = [] }) {
  tableInteractive()
    .findAllByTestId("header-cell")
    .should("have.length", columns.length);

  columns.forEach((column, index) => {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    tableInteractive()
      .findAllByTestId("header-cell")
      .eq(index)
      .should("have.text", column);
  });

  firstRows.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      tableInteractiveBody()
        .findAllByTestId("cell-data")
        .eq(columns.length * rowIndex + cellIndex)
        .should("have.text", cell);
    });
  });
}

/**
 * selects the global new button
 * @param {*} menuItem optional, if provided, will click the New button and return the menu item with the text provided
 * @returns
 */
export function newButton(menuItem = undefined) {
  if (menuItem) {
    cy.findByTestId("app-bar").button("New").click();
    return popover().findByText(menuItem);
  }

  return cy.findByTestId("app-bar").button("New");
}

export function multiSelectInput(filter = ":eq(0)") {
  return cy.findByRole("combobox").filter(filter).get("input").first();
}

export function multiAutocompleteInput(filter = ":eq(0)") {
  return cy.findAllByRole("combobox").filter(filter).get("input").first();
}

export function fieldValuesCombobox() {
  return cy.findByRole("combobox");
}

export function fieldValuesTextbox() {
  return cy.findByRole("textbox");
}

export function fieldValuesValue(index) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return cy.findAllByTestId("token-field").eq(index);
}

export function removeFieldValuesValue(index) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return cy
    .findAllByTestId("token-field")
    .findAllByLabelText("Remove")
    .eq(index)
    .click();
}

export function multiAutocompleteValue(index, filter = ":eq(0)") {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return cy
    .findAllByRole("combobox")
    .filter(filter)
    .siblings("[data-with-remove]")
    .eq(index);
}

export function removeMultiAutocompleteValue(index, filter) {
  return multiAutocompleteValue(index, filter)
    .findByRole("button", { hidden: true })
    .click();
}

export function repeatAssertion(assertFn, timeout = 4000, interval = 400) {
  if (timeout <= 0) {
    return;
  }
  assertFn();

  cy.wait(interval);
  repeatAssertion(assertFn, timeout - interval, interval);
}

export function mapPinIcon() {
  return cy.get(".leaflet-marker-icon");
}

export function waitForLoaderToBeRemoved() {
  cy.findByTestId("loading-indicator").should("not.exist");
}

export function leaveConfirmationModal() {
  return cy.findByTestId("leave-confirmation");
}

export function getUniqueTableColumnValues(columnName) {
  const values = [];

  tableInteractiveBody().within(() => {
    cy.get(`[data-column-id="${columnName}"]`)
      .each(($item) => values.push($item.text()))
      .then(() => {
        cy.wrap(Array.from(new Set(values))).as("items");
      });
  });

  return cy.get("@items");
}

export function ensureParameterColumnValue({ columnName, columnValue }) {
  tableInteractiveBody().within(() => {
    cy.get(`[data-column-id="${columnName}"]`).each((cell) => {
      cy.wrap(cell).should("have.text", columnValue);
    });
  });
}
