import { visitDashboard } from "./e2e-misc-helpers";
import { popover } from "./e2e-ui-elements-helpers";

// Metabase utility functions for commonly-used patterns
export function selectDashboardFilter(selection, filterName) {
  selection.contains("Select…").click();
  popover().contains(filterName).click({ force: true });
}

export function getDashboardCards() {
  return cy.get(".DashCard");
}

export function getDashboardCard(index = 0) {
  return getDashboardCards().eq(index);
}

function getDashCardApiUrl(dashId) {
  return `/api/dashboard/${dashId}/cards`;
}

const DEFAULT_CARD = {
  id: -1,
  row: 0,
  col: 0,
  size_x: 11,
  size_y: 8,
  visualization_settings: {},
  parameter_mappings: [],
};

export function addOrUpdateDashboardCard({ card_id, dashboard_id, card }) {
  return cy
    .request("PUT", getDashCardApiUrl(dashboard_id), {
      cards: [
        {
          ...DEFAULT_CARD,
          card_id,
          ...card,
        },
      ],
    })
    .then(response => ({
      ...response,
      body: response.body.cards[0],
    }));
}

/**
 * Replaces all the cards on a dashboard with the array given in the `cards` parameter.
 * Can be used to remove cards (exclude from array), or add/update them.
 */
export function updateDashboardCards({ dashboard_id, cards }) {
  let id = -1;
  return cy.request("PUT", getDashCardApiUrl(dashboard_id), {
    cards: cards.map(card => ({ ...DEFAULT_CARD, id: id--, ...card })),
  });
}

export function getDashboardCardMenu(index = 0) {
  return getDashboardCard(index).findByTestId("dashcard-menu");
}

export function showDashboardCardActions(index = 0) {
  getDashboardCard(index).realHover({ scrollBehavior: "bottom" });
}

export function removeDashboardCard(index = 0) {
  showDashboardCardActions(index);
  cy.findAllByTestId("dashboardcard-actions-panel")
    .eq(0)
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
} = {}) {
  cy.findByText(buttonLabel).click();
  cy.findByText(editBarText).should("not.exist");
  cy.wait(1); // this is stupid but necessary to due to the dashboard resizing and detaching elements
}

export function checkFilterLabelAndValue(label, value) {
  cy.get("fieldset").find("legend").invoke("text").should("eq", label);

  cy.get("fieldset").contains(value);
}

export function setFilter(type, subType) {
  cy.icon("filter").click();

  cy.findByText("What do you want to filter?");

  popover().within(() => {
    cy.findByText(type).click();

    if (subType) {
      cy.findByText(subType).click();
    }
  });
}

export function createEmptyTextBox() {
  cy.findByLabelText("Edit dashboard").click();
  cy.findByLabelText("Add a heading or text box").click();
  popover().findByText("Text").click();
}

export function addTextBox(string, options = {}) {
  cy.findByLabelText("Edit dashboard").click();
  addTextBoxWhileEditing(string, options);
}

export function addTextBoxWhileEditing(string, options = {}) {
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

export function addHeading(string, options = {}) {
  cy.findByLabelText("Edit dashboard").click();
  addHeadingWhileEditing(string, options);
}

export function addHeadingWhileEditing(string, options = {}) {
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

export function deleteTab(tabName) {
  cy.findByRole("tab", { name: tabName }).findByRole("button").click();
  popover().within(() => {
    cy.findByText("Delete").click();
  });
}

export function visitDashboardAndCreateTab({ dashboardId, save = true }) {
  visitDashboard(dashboardId);
  editDashboard();
  createNewTab();
  if (save) {
    saveDashboard();
  }
}

export function resizeDashboardCard({ card, x, y }) {
  card.within(() => {
    const resizeHandle = cy.get(".react-resizable-handle");
    resizeHandle
      .trigger("mousedown", { button: 0 })
      .trigger("mousemove", {
        clientX: x,
        clientY: y,
      })
      .trigger("mouseup", { force: true });
  });
}

export function createLinkCard() {
  cy.icon("link").click();
}

export function toggleDashboardInfoSidebar() {
  dashboardHeader().icon("info").click();
}

export function openDashboardMenu() {
  dashboardHeader().findByLabelText("dashboard-menu-button").click();
}

/**
 *
 * @param {number} dashboardId
 * @param {Object} option
 * @param {number=} option.id
 * @param {number=} option.col
 * @param {number=} option.row
 * @param {number=} option.size_x
 * @param {number=} option.size_y
 * @param {string} option.text
 */
export function createTextCard({
  id = getNextUnsavedDashboardCardId(),
  col = 0,
  row = 0,
  size_x = 4,
  size_y = 6,
  text,
}) {
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

export const getNextUnsavedDashboardCardId = (() => {
  let id = 0;
  return () => --id;
})();

export const dashboardHeader = () => {
  return cy.findByTestId("dashboard-header");
};
