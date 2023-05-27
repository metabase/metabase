import {
  restore,
  popover,
  editDashboard,
  saveDashboard,
  visitDashboard,
  updateDashboardCards,
} from "e2e/support/helpers";

const filter1 = {
  name: "Card 1 Filter",
  slug: "card1_filter",
  id: "ab6f631",
  type: "string/=",
  sectionId: "string",
};

const filter2 = {
  name: "Card 2 Filter",
  slug: "card2_filter",
  id: "a9801ade",
  type: "string/=",
  sectionId: "string",
};

describe("issue 19494", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Add two "Orders" questions to the existing "Orders in a dashboard" dashboard
    updateDashboardCards({
      dashboard_id: 1,
      cards: [
        {
          card_id: 1,
          row: 0,
          col: 0,
          size_x: 8,
          size_y: 8,
        },
        {
          card_id: 1,
          row: 0,
          col: 8,
          size_x: 8,
          size_y: 8,
        },
      ],
    });

    // Add two dashboard filters (not yet connected to any of the cards)
    cy.request("PUT", "/api/dashboard/1", {
      parameters: [filter1, filter2],
    });
  });

  it("should correctly apply different filters with default values to all cards of the same question (metabase#19494)", () => {
    // Instead of using the API to connect filters to the cards,
    // let's use UI to replicate user experience as closely as possible
    visitDashboard(1);

    editDashboard();

    connectFilterToCard({ filterName: "Card 1 Filter", cardPosition: 0 });
    setDefaultFilter("Doohickey");

    connectFilterToCard({ filterName: "Card 2 Filter", cardPosition: -1 });
    setDefaultFilter("Gizmo");

    saveDashboard();

    checkAppliedFilter("Card 1 Filter", "Doohickey");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("148.23");

    checkAppliedFilter("Card 2 Filter", "Gizmo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("110.93");
  });
});

function connectFilterToCard({ filterName, cardPosition }) {
  cy.findByText(filterName).find(".Icon-gear").click();

  cy.findAllByText("Select…").eq(cardPosition).click();

  popover().contains("Category").click();
}

function setDefaultFilter(value) {
  cy.findByText("No default").click();

  popover().contains(value).click();

  cy.button("Add filter").click();
}

function checkAppliedFilter(name, value) {
  cy.findByText(name).closest("fieldset").contains(value);
}
