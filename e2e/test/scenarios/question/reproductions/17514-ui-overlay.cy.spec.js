import {
  restore,
  showDashboardCardActions,
  filterWidget,
  saveDashboard,
  editDashboard,
  visualize,
  visitDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { setAdHocFilter } from "../../native-filters/helpers/e2e-date-filter-helpers";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

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

describe("issue 17514", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("scenario 1", () => {
    beforeEach(() => {
      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: card }) => {
        const { card_id, dashboard_id } = card;

        cy.intercept(
          "POST",
          `/api/dashboard/${dashboard_id}/dashcard/*/card/${card_id}/query`,
        ).as("cardQuery");

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

        visitDashboard(dashboard_id);

        cy.wait("@cardQuery");
        cy.findByText("110.93").should("be.visible");
      });
    });

    it("should not show the run overlay when we apply dashboard filter on a question with removed column and then click through its title (metabase#17514-1)", () => {
      editDashboard();

      openVisualizationOptions();

      hideColumn("Products → Ean");

      closeModal();

      saveDashboard();

      filterWidget().click();
      setAdHocFilter({ timeBucket: "years" });

      cy.location("search").should("eq", "?date_filter=past30years");
      cy.wait("@cardQuery");

      cy.findByText("Previous 30 Years");

      cy.findByText("17514").click();
      cy.wait("@dataset");
      cy.findByTextEnsureVisible("Subtotal");

      // Cypress cannot click elements that are blocked by an overlay so this will immediately fail if the issue is not fixed
      cy.findByText("110.93").click();
      cy.findByText("Filter by this value");
    });
  });

  describe("scenario 2", () => {
    beforeEach(() => {
      cy.createQuestion(questionDetails, { visitQuestion: true });

      cy.findByTestId("viz-settings-button").click();

      moveColumnToTop("Subtotal");

      openNotebookMode();

      removeJoinedTable();

      visualize();
      cy.findByTextEnsureVisible("Subtotal");

      cy.findByText("Save").click();

      cy.get(".Modal").within(() => {
        cy.button("Save").click();
      });
    });

    it("should not show the run overlay because of the references to the orphaned fields (metabase#17514-2)", () => {
      openNotebookMode();

      cy.findByText("Join data").click();
      cy.findByText("Products").click();

      visualize();

      // Cypress cannot click elements that are blocked by an overlay so this will immediately fail if the issue is not fixed
      cy.findByTextEnsureVisible("Subtotal").click();
      cy.findByText("Filter by this column");
    });
  });
});

function openVisualizationOptions() {
  showDashboardCardActions();
  cy.icon("palette").click({ force: true });
}

function hideColumn(columnName) {
  cy.findByTestId("chartsettings-sidebar").within(() => {
    cy.findByText(columnName).siblings("[data-testid$=hide-button]").click();
  });
}

function closeModal() {
  cy.get(".Modal").within(() => {
    cy.button("Done").click();
  });
}

function openNotebookMode() {
  cy.icon("notebook").click();
}

function removeJoinedTable() {
  cy.findAllByText("Join data")
    .first()
    .parent()
    .findByLabelText("Remove step")
    .click({ force: true });
}

function moveColumnToTop(column) {
  cy.findByTestId("sidebar-left").within(() => {
    cy.findByText(column)
      .should("be.visible")
      .closest("[data-testid^=draggable-item]")
      .trigger("mousedown", 0, 0, { force: true })
      .trigger("mousemove", 5, 5, { force: true })
      .trigger("mousemove", 0, -600, { force: true })
      .trigger("mouseup", 0, -600, { force: true });
  });
}
