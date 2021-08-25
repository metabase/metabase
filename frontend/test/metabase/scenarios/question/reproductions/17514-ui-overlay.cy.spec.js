import {
  restore,
  showDashboardCardActions,
  filterWidget,
  saveDashboard,
  editDashboard,
} from "__support__/e2e/cypress";

import { setAdHocFilter } from "../../native-filters/helpers/e2e-date-filter-helpers";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const questionDetails = {
  name: "17514",
  query: {
    "source-table": ORDERS_ID,
    joins: [
      {
        fields: "all",
        "source-table": PRODUCTS_ID,
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        alias: "Products",
      },
    ],
  },
};

const filter = {
  name: "Date Filter",
  slug: "date_filter",
  id: "23ccbbf",
  type: "date/all-options",
  sectionId: "date",
};

const dashboardDetails = { parameters: [filter] };

describe.skip("issue 17514", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("scenario 1", () => {
    beforeEach(() => {
      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: card }) => {
          const { card_id, dashboard_id } = card;

          cy.intercept("POST", `/api/card/${card_id}/query`).as("cardQuery");

          const mapFilterToCard = {
            parameter_mappings: [
              {
                parameter_id: filter.id,
                card_id,
                target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
              },
            ],
          };

          cy.editDashboardCard(card, mapFilterToCard);

          cy.visit(`/dashboard/${dashboard_id}`);

          cy.wait("@cardQuery");
        },
      );
    });

    it("should not show the run overlay when we apply dashboard filter on a question with removed column and then click through its title (metabase#17514-1)", () => {
      editDashboard();

      openVisualizationOptions();

      hideColumn("Products → Ean");

      closeModal();

      saveDashboard();

      filterWidget().click();
      setAdHocFilter({ timeBucket: "Years" });

      cy.findByText("Previous 30 Years");

      cy.findByText("17514").click();

      // Cypress cannot click elements that are blocked by an overlay so this will immediately fail if the issue is not fixed
      cy.findByText("110.93").click();
      cy.findByText("Filter by this value");
    });
  });

  describe("scenario 2", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");

      cy.createQuestion(questionDetails, { visitQuestion: true });

      cy.findByTestId("viz-settings-button").click();

      moveColumnToTop("Subtotal");

      openNotebookMode();

      removeJoinedTable();

      visualizeResults();

      cy.findByText("Save").click();

      cy.get(".Modal").within(() => {
        cy.button("Save").click();
      });
    });

    it("should not show the run overlay because ofth references to the orphaned fields (metabase#17514-1)", () => {
      openNotebookMode();

      cy.findByText("Join data").click();
      cy.findByText("Products").click();

      visualizeResults();

      // Cypress cannot click elements that are blocked by an overlay so this will immediately fail if the issue is not fixed
      cy.findByText("110.93").click();
      cy.findByText("Filter by this value");
    });
  });
});

function openVisualizationOptions() {
  showDashboardCardActions();
  cy.icon("palette").click();
}

function hideColumn(columnName) {
  cy.findByTestId("chartsettings-sidebar").within(() => {
    cy.findByText(columnName)
      .siblings(".Icon-close")
      .click();
  });
}

function closeModal() {
  cy.get(".Modal").within(() => {
    cy.button("Done").click();
  });
}

function visualizeResults() {
  cy.button("Visualize").click();
  cy.wait("@dataset");
}

function openNotebookMode() {
  cy.icon("notebook").click();
}

function removeJoinedTable() {
  cy.findAllByText("Join data")
    .parent()
    .find(".Icon-close")
    .click({ force: true });
}

function moveColumnToTop(column) {
  cy.findByTestId("sidebar-left").within(() => {
    cy.findByText(column)
      .should("be.visible")
      .closest(".cursor-grab")
      .trigger("mousedown", 0, 0, { force: true })
      .trigger("mousemove", 5, 5, { force: true })
      .trigger("mousemove", 0, -600, { force: true })
      .trigger("mouseup", 0, -600, { force: true });
  });
}
