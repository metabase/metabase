// various Metabase-specific "scoping" functions like inside popover/modal/navbar/main/sidebar content area
export const POPOVER_ELEMENT =
  ".popover[data-state~='visible'],[data-element-id=mantine-popover]";

export function popover() {
  cy.get(POPOVER_ELEMENT).should("be.visible");
  return cy.get(POPOVER_ELEMENT);
}

const HOVERCARD_ELEMENT = ".emotion-HoverCard-dropdown[role='dialog']:visible";

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

export function modal() {
  const MODAL_SELECTOR = ".emotion-Modal-content[role='dialog']";
  const LEGACY_MODAL_SELECTOR = "[data-testid=modal]";
  return cy.get([MODAL_SELECTOR, LEGACY_MODAL_SELECTOR].join(","));
}

export function tooltip() {
  return cy.get(".emotion-Tooltip-tooltip");
}

export function entityPickerModal() {
  return cy.findByTestId("entity-picker-modal");
}

export function entityPickerModalLevel(level) {
  return cy.findByTestId(`item-picker-level-${level}`);
}

export function entityPickerModalItem(level, name) {
  return entityPickerModalLevel(level).findByText(name).parents("button");
}

export function entityPickerModalTab(name) {
  return cy.findAllByRole("tab").filter(`:contains(${name})`);
}

// displays at least these tabs:
export function shouldDisplayTabs(tabs) {
  tabs.forEach(tab => {
    entityPickerModalTab(tab).should("exist");
  });
}

export function tabsShouldBe(selected, tabs) {
  cy.log(tabs);
  cy.findAllByRole("tab").should("have.length", tabs.length);
  tabs.forEach(tab => {
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

export function sidebar() {
  return cy.get("main aside");
}

export function rightSidebar() {
  return cy.findByTestId("sidebar-right");
}

export function leftSidebar() {
  return cy.findByTestId("sidebar-left");
}

export function navigationSidebar() {
  return cy.findByTestId("main-navbar-root");
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

/**
 * Get the `fieldset` HTML element that we use as a filter widget container.
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
export function filterWidget() {
  return cy.get("fieldset");
}

export function clearFilterWidget(index = 0) {
  return filterWidget().eq(index).icon("close").click();
}

export function resetFilterWidgetToDefault(index = 0) {
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
      removeMultiAutocompleteValue(0);
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
    values.forEach(value => cy.findByText(value).click());
    cy.button(buttonLabel).click();
  });
}

export const openQuestionActions = () => {
  cy.findByTestId("qb-header-action-panel").icon("ellipsis").click();
};

export const collectionTable = () => {
  return cy.findByTestId("collection-table");
};

export const queryBuilderHeader = () => {
  return cy.findByTestId("qb-header");
};

export const queryBuilderFooter = () => {
  return cy.findByTestId("view-footer");
};

export const closeQuestionActions = () => {
  queryBuilderHeader().click();
};

export const questionInfoButton = () => {
  return cy.findByTestId("qb-header-info-button");
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

export const moveDnDKitElement = (
  element,
  { horizontal = 0, vertical = 0 } = {},
) => {
  element
    .trigger("pointerdown", 0, 0, {
      force: true,
      isPrimary: true,
      button: 0,
    })
    .wait(200)
    // This initial move needs to be greater than the activation constraint
    // of the pointer sensor
    .trigger("pointermove", 20, 20, {
      force: true,
      isPrimary: true,
      button: 0,
    })
    .wait(200)
    .trigger("pointermove", horizontal, vertical, {
      force: true,
      isPrimary: true,
      button: 0,
    })
    .wait(200)
    .trigger("pointerup", horizontal, vertical, {
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

export const undoToast = () => {
  return cy.findByTestId("toast-undo");
};

export const undoToastList = () => {
  return cy.findAllByTestId("toast-undo");
};

export function dashboardCards() {
  return cy.get("[data-element-id=dashboard-cards-container]");
}

export function tableInteractive() {
  return cy.findByTestId("TableInteractive-root");
}

export function tableHeaderClick(headerString) {
  tableInteractive().within(() => {
    cy.findByTextEnsureVisible(headerString).trigger("mousedown");
  });

  tableInteractive().within(() => {
    cy.findByTextEnsureVisible(headerString).trigger("mouseup");
  });
}

/**
 * selects the global new button
 * @param {*} menuItem optional, if provided, will click the New button and return the menu item with the text provided
 * @returns
 */
export function newButton(menuItem) {
  if (menuItem) {
    cy.findByTestId("app-bar").button("New").click();
    return popover().findByText(menuItem);
  }

  return cy.findByTestId("app-bar").button("New");
}

export function multiSelectInput(filter = ":eq(0)") {
  return cy.findByRole("combobox").filter(filter).get("input").last();
}

export function multiAutocompleteInput(filter = ":eq(0)") {
  return cy.findAllByRole("combobox").filter(filter).get("input").last();
}

export function multiAutocompleteValue(index, filter = ":eq(0)") {
  return cy
    .findAllByRole("combobox")
    .filter(filter)
    .get(`[value][index=${index}]`);
}

export function removeMultiAutocompleteValue(index, filter) {
  return multiAutocompleteValue(index, filter)
    .findByRole("button", { hidden: true })
    .click();
}
