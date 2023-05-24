import { popover } from "./e2e-ui-elements-helpers";

const REVISION_HISTORY_INTERVAL = 200;
const REVISION_HISTORY_TIMEOUT = 2000;

// Metabase utility functions for commonly-used patterns
export function selectDashboardFilter(selection, filterName) {
  selection.contains("Select…").click();
  popover().contains(filterName).click({ force: true });
}

export function getDashboardCard(index = 0) {
  return cy.get(".DashCard").eq(index);
}

function getDashCardApiUrl(dashId) {
  return `/api/dashboard/${dashId}/cards`;
}

const DEFAULT_CARD = {
  id: -1,
  row: 0,
  col: 0,
  size_x: 8,
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
  getDashboardCard(index).realHover();
}

export function editDashboard() {
  cy.icon("pencil").click();
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

export function addTextBox(string, options = {}) {
  cy.icon("pencil").click();
  cy.icon("string").click();
  cy.findByPlaceholderText(
    "You can use Markdown here, and include variables {{like_this}}",
  ).type(string, options);
}

export function openQuestionsSidebar() {
  cy.findByLabelText("Add questions").click();
}

export const expectGoodRevisionEvents = ({ url, count }) => {
  retryRevisionRequest({ url, condition: ({ body }) => body.length >= count })
    .its("body")
    .should("have.length", count);
};

// BE adds revision events async, so sometimes we need to wait for event to be added
const retryRevisionRequest = ({
  url,
  condition,
  timeout = REVISION_HISTORY_TIMEOUT,
  interval = REVISION_HISTORY_INTERVAL,
}) => {
  return cy
    .request({
      url,
      json: true,
    })
    .then(response => {
      if (condition(response)) {
        return cy.wrap(response);
      } else if (timeout > 0) {
        cy.wait(interval);
        return retryRevisionRequest({
          url,
          condition,
          timeout: timeout - interval,
        });
      } else {
        throw new Error("Revision retry timeout");
      }
    });
};
