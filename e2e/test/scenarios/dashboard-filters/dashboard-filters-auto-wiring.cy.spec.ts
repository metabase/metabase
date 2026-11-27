const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { CardId } from "metabase-types/api";

const { ORDERS_ID, PRODUCTS_ID, REVIEWS_ID } = SAMPLE_DATABASE;

describe("dashboard filters auto-wiring", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("adding cards with foreign keys to the dashboard (metabase#36275)", () => {
    beforeEach(() => {
      H.createQuestion({
        name: "Products Question",
        query: { "source-table": PRODUCTS_ID, limit: 1 },
      }).then(({ body: { id } }) => {
        createDashboardWithCards({
          dashboardName: "36275",
          cards: [{ card_id: id, row: 0, col: 0 }],
        });
      });

      H.createQuestion({
        name: "Orders Question",
        query: { "source-table": ORDERS_ID, limit: 1 },
      }).then(({ body: { id } }) => {
        cy.wrap(id).as("ordersQuestionId");
      });

      H.createQuestion({
        name: "Reviews Question",
        query: { "source-table": REVIEWS_ID, limit: 1 },
      }).then(({ body: { id } }) => {
        cy.wrap(id).as("reviewsQuestionId");
      });
    });

    it("should auto-wire and filter cards with foreign keys when added to the dashboard via the sidebar", () => {
      H.visitDashboard("@dashboardId");
      H.editDashboard();
      H.setFilter("ID");
      H.selectDashboardFilter(H.getDashboardCard(0), "ID");

      addCardToDashboard(["Orders Question", "Reviews Question"]);

      goToFilterMapping("ID");

      // The two auto-wire suggestion toasts stack and briefly overlap while the
      // undo list re-measures and animates them into their final positions, so a
      // sibling toast can transiently cover the precisely-scoped Auto-connect
      // button. Force the click past that obstruction — the target button is
      // already uniquely scoped via .contains(...).closest("toast-undo").
      H.undoToastList()
        .contains("Auto-connect “Orders Question” to “ID”?")
        .closest("[data-testid='toast-undo']")
        .findByRole("button", { name: "Auto-connect" })
        .click({ force: true });

      H.undoToastList()
        .contains("Auto-connect “Reviews Question” to “ID”?")
        .closest("[data-testid='toast-undo']")
        .findByRole("button", { name: "Auto-connect" })
        .click({ force: true });

      H.getDashboardCard(0).findByText("Products.ID").should("exist");
      H.getDashboardCard(1).findByText("Product.ID").should("exist");
      H.getDashboardCard(2).findByText("Product.ID").should("exist");

      H.saveDashboard();

      filterByIdAndCheckCards();
    });

    it("should auto-wire and filter cards with foreign keys when added to the dashboard via the query builder", () => {
      H.visitDashboard("@dashboardId");
      H.editDashboard();
      H.setFilter("ID");
      H.selectDashboardFilter(H.getDashboardCard(0), "ID");
      H.saveDashboard();

      cy.get<CardId>("@ordersQuestionId").then((ordersQuestionId) => {
        addQuestionFromQueryBuilder({ questionId: ordersQuestionId });
      });

      cy.get<CardId>("@reviewsQuestionId").then((reviewsQuestionId) => {
        addQuestionFromQueryBuilder({
          questionId: reviewsQuestionId,
          saveDashboardAfterAdd: false,
        });
      });

      goToFilterMapping("ID");

      H.getDashboardCard(0).findByText("Products.ID").should("exist");
      H.getDashboardCard(1).findByText("Product.ID").should("exist");
      H.getDashboardCard(2).findByText("Product.ID").should("exist");

      H.saveDashboard();

      filterByIdAndCheckCards();
    });
  });
});

function createDashboardWithCards({
  dashboardName,
  cards,
}: {
  dashboardName: string;
  cards: { card_id: CardId; row: number; col: number }[];
}) {
  return H.createDashboard({ name: dashboardName }).then(({ body: { id } }) => {
    H.updateDashboardCards({
      dashboard_id: id,
      cards,
    });

    cy.wrap(id).as("dashboardId");
  });
}

function addCardToDashboard(dashcardNames: string[]) {
  H.openQuestionsSidebar();
  for (const dashcardName of dashcardNames) {
    cy.findByTestId("add-card-sidebar").findByText(dashcardName).click();
  }
}

function goToFilterMapping(name: string) {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function filterByIdAndCheckCards() {
  H.dashboardParametersContainer().findByText("ID").click();

  cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
    "filteredCardQuery",
  );

  H.dashboardParametersPopover().within(() => {
    H.fieldValuesCombobox().type("3,");
    cy.button("Add filter").click();
  });

  cy.wait("@filteredCardQuery");

  H.getDashboardCard(0).within(() => {
    getTableCell("ID", 0).should("have.text", "3");
  });

  H.getDashboardCard(1).within(() => {
    getTableCell("Product ID", 0).should("have.text", "3");
  });

  H.getDashboardCard(2).within(() => {
    getTableCell("Product ID", 0).should("have.text", "3");
  });
}

function getTableCell(columnName: string, rowIndex: number) {
  cy.findAllByRole("columnheader").then(($columnHeaders) => {
    const columnHeaderIndex = $columnHeaders
      .toArray()
      .findIndex(($columnHeader) => $columnHeader.textContent === columnName);
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.tableInteractiveBody()
      .findAllByRole("row")
      .eq(rowIndex)
      .findAllByTestId("cell-data")
      .eq(columnHeaderIndex)
      .as("cellData");
  });

  return cy.get("@cellData");
}

function addQuestionFromQueryBuilder({
  questionId,
  saveDashboardAfterAdd = true,
}: {
  questionId: CardId;
  saveDashboardAfterAdd?: boolean;
}) {
  H.visitQuestion(questionId);

  H.openQuestionActions();
  H.popover().findByText("Add to dashboard").click();

  H.pickEntity({ path: ["Our analytics", "36275"], select: true });

  H.undoToast().findByRole("button", { name: "Auto-connect" }).click();
  H.undoToast().should("contain", "Undo");

  if (saveDashboardAfterAdd) {
    H.saveDashboard();
  }
}
