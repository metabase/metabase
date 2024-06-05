import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  popover,
  restore,
  visitDashboard,
  editDashboard,
  getDashboardCard,
  selectDashboardFilter,
  saveDashboard,
  updateDashboardCards,
  visitDashboardAndCreateTab,
  goToTab,
  createNewTab,
  undoToast,
  undoToastList,
  setFilter,
  visitQuestion,
  modal,
  dashboardParametersContainer,
  openQuestionActions,
  entityPickerModal,
} from "e2e/support/helpers";

const { ORDERS_ID, PRODUCTS_ID, REVIEWS_ID } = SAMPLE_DATABASE;

const cards = [
  {
    card_id: ORDERS_COUNT_QUESTION_ID,
    row: 0,
    col: 0,
    size_x: 5,
    size_y: 4,
  },
  {
    card_id: ORDERS_COUNT_QUESTION_ID,
    row: 0,
    col: 5,
    size_x: 5,
    size_y: 4,
  },
];

describe("dashboard filters auto-wiring", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
  });

  describe("when wiring parameter to all cards for a filter", () => {
    it("should wire parameters to cards with matching fields", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");

      getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      getDashboardCard(1).findByText("User.Name").should("not.exist");

      undoToast().findByText("Auto-connect").click();
      undoToast().should("contain", "User.Name");
    });

    it("should not wire parameters to cards that already have a parameter, despite matching fields", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");

      getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      undoToast()
        .should(
          "contain",
          "Auto-connect this filter to all questions containing",
        )
        .findByRole("button", { name: "Auto-connect" })
        .click();

      getDashboardCard(1).within(() => {
        cy.findByLabelText("close icon").click();
      });

      selectDashboardFilter(getDashboardCard(1), "Address");

      getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      getDashboardCard(1).within(() => {
        cy.findByText("User.Address").should("exist");
      });

      undoToast().should("contain", "Undo");
    });

    it("should not suggest to wire parameters to cards that don't have a matching field", () => {
      cy.createQuestion({
        name: "Products Table",
        query: { "source-table": PRODUCTS_ID, limit: 1 },
      }).then(({ body: { id: questionId } }) => {
        createDashboardWithCards({
          cards: [
            {
              card_id: ORDERS_BY_YEAR_QUESTION_ID,
              row: 0,
              col: 0,
              size_x: 5,
              size_y: 4,
            },
            {
              card_id: questionId,
              row: 0,
              col: 4,
              size_x: 5,
              size_y: 4,
            },
          ],
        }).then(dashboardId => {
          visitDashboard(dashboardId);
        });
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");

      undoToast().should("not.exist");
    });

    it("should not autowire parameters to cards in different tabs", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboardAndCreateTab({
          dashboardId,
          save: false,
        });
      });

      setFilter("Text or Category", "Is");

      addCardToDashboard();
      goToFilterMapping();

      selectDashboardFilter(getDashboardCard(0), "Name");

      getDashboardCard(0).findByText("User.Name").should("exist");

      undoToast().should("not.exist");

      goToTab("Tab 1");

      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("not.exist");
      }
    });

    it("should undo parameter wiring when 'Undo' is clicked", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");
      addCardToDashboard();
      goToFilterMapping();

      selectDashboardFilter(getDashboardCard(0), "Name");

      undoToast().findByRole("button", { name: "Auto-connect" }).click();

      getDashboardCard(0).findByText("User.Name").should("exist");

      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      undoToast().findByRole("button", { name: "Undo" }).click();

      getDashboardCard(0).findByText("User.Name").should("exist");
      for (let i = 1; i < cards.length; i++) {
        getDashboardCard(i).findByText("Select…").should("exist");
      }
    });

    it("in case of two autowiring undo toast, the second one should last the default timeout of 12s", () => {
      // The autowiring undo toasts use the same id, a bug in the undo logic caused the second toast to be dismissed by the
      // timeout set by the first. See https://github.com/metabase/metabase/pull/35461#pullrequestreview-1731776862
      const cardTemplate = {
        card_id: ORDERS_BY_YEAR_QUESTION_ID,
        row: 0,
        col: 0,
        size_x: 5,
        size_y: 4,
      };
      const cards = [
        {
          ...cardTemplate,
          col: 0,
        },
        {
          ...cardTemplate,
          col: 5,
        },
        {
          ...cardTemplate,
          col: 10,
        },
      ];

      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      cy.clock();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");

      removeFilterFromDashCard(0);

      cy.tick(2000);

      selectDashboardFilter(getDashboardCard(0), "Name");

      // since we waited 2s earlier, if the toast is still visible after this other delay of 11s,
      // it means the first timeout of 12s was cleared correctly
      cy.tick(11000);
      undoToast().should("exist");

      cy.tick(2000);
      undoToast().should("not.exist");
    });
  });

  describe("wiring parameters when adding a card", () => {
    it("should wire parameters to cards that are added to the dashboard", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");
      undoToast().findByRole("button", { name: "Auto-connect" }).click();

      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      addCardToDashboard();
      undoToastList()
        .eq(1)
        .findByRole("button", { name: "Auto-connect" })
        .click();
      goToFilterMapping();

      for (let i = 0; i < cards.length + 1; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      undoToastList()
        .eq(1)
        .findByText("“Orders Model” was auto-connected to “Text”.")
        .should("be.visible");
    });

    it("should not wire parameters to cards that are added to the dashboard in a different tab", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");

      undoToast()
        .should(
          "contain",
          "Auto-connect this filter to all questions containing",
        )
        .findByRole("button", { name: "Auto-connect" })
        .click();

      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      createNewTab();
      addCardToDashboard();
      goToFilterMapping();

      getDashboardCard(0).findByText("User.Name").should("not.exist");

      cy.log("verify that no new toast with suggestion to auto-wire appeared");

      undoToastList()
        .should("have.length", 1)
        .should(
          "contain",
          "The filter was auto-connected to all questions containing “User.Name”",
        );
    });

    it("should undo parameter wiring when 'Undo' is clicked", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");
      undoToast().findByRole("button", { name: "Auto-connect" }).click();

      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      addCardToDashboard();
      goToFilterMapping();

      undoToastList()
        .eq(1)
        .should("contain", "Auto-connect “Orders Model” to “Text”?")
        .findByRole("button", { name: "Auto-connect" })
        .click();

      for (let i = 0; i < cards.length + 1; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      cy.log("verify undo functionality");
      undoToastList().eq(1).findByText("Undo").click();

      getDashboardCard(0).findByText("User.Name").should("exist");
      getDashboardCard(1).findByText("User.Name").should("exist");
      getDashboardCard(2).findByText("Select…").should("exist");
    });
  });

  describe("adding cards with foreign keys to the dashboard (metabase#36275)", () => {
    beforeEach(() => {
      cy.intercept(
        "POST",
        "/api/dashboard/*/dashcard/*/card/*/query",
        cy.spy().as("cardQueryRequest"),
      ).as("cardQuery");

      cy.createQuestion({
        name: "Products Question",
        query: { "source-table": PRODUCTS_ID, limit: 1 },
      }).then(({ body: { id } }) => {
        createDashboardWithCards({
          dashboardName: "36275",
          cards: [
            {
              card_id: id,
              row: 0,
              col: 0,
            },
          ],
        });
        cy.wrap(id).as("productsQuestionId");
      });

      cy.createQuestion({
        name: "Orders Question",
        query: { "source-table": ORDERS_ID, limit: 1 },
      }).then(({ body: { id } }) => {
        cy.wrap(id).as("ordersQuestionId");
      });

      cy.createQuestion({
        name: "Reviews Question",
        query: { "source-table": REVIEWS_ID, limit: 1 },
      }).then(({ body: { id } }) => {
        cy.wrap(id).as("reviewsQuestionId");
      });
    });

    it("should autowire and filter cards with foreign keys when added to the dashboard via the sidebar", () => {
      visitDashboard("@dashboardId");
      editDashboard();
      setFilter("ID");
      selectDashboardFilter(getDashboardCard(0), "ID");

      addCardToDashboard(["Orders Question", "Reviews Question"]);

      cy.wait("@cardQuery");

      goToFilterMapping("ID");

      undoToastList()
        .findByText("Auto-connect “Orders Question” to “ID”?")
        .closest("[data-testid='toast-undo']")
        .findByRole("button", { name: "Auto-connect" })
        .click();

      undoToastList()
        .findByText("Auto-connect “Reviews Question” to “ID”?")
        .closest("[data-testid='toast-undo']")
        .findByRole("button", { name: "Auto-connect" })
        .click();

      getDashboardCard(0).findByText("Product.ID").should("exist");
      getDashboardCard(1).findByText("Product.ID").should("exist");
      getDashboardCard(2).findByText("Product.ID").should("exist");

      saveDashboard();

      dashboardParametersContainer().findByText("ID").click();

      popover().within(() => {
        cy.findByRole("textbox").type("1{enter}");
        cy.button("Add filter").click();
      });

      cy.wait("@cardQuery");

      getDashboardCard(0).within(() => {
        getTableCell("ID", 0).should("contain", "1");
      });

      getDashboardCard(1).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });

      getDashboardCard(2).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });
    });

    it("should autowire and filter cards with foreign keys when added to the dashboard via the query builder", () => {
      visitDashboard("@dashboardId");
      editDashboard();
      setFilter("ID");
      selectDashboardFilter(getDashboardCard(0), "ID");
      saveDashboard();

      cy.get("@ordersQuestionId").then(ordersQuestionId => {
        addQuestionFromQueryBuilder({ questionId: ordersQuestionId });
      });

      cy.get("@reviewsQuestionId").then(reviewsQuestionId => {
        addQuestionFromQueryBuilder({
          questionId: reviewsQuestionId,
          saveDashboardAfterAdd: false,
        });
      });

      cy.wait("@cardQuery");

      goToFilterMapping("ID");

      getDashboardCard(0).findByText("Product.ID").should("exist");
      getDashboardCard(1).findByText("Product.ID").should("exist");
      getDashboardCard(2).findByText("Product.ID").should("exist");

      saveDashboard();

      dashboardParametersContainer().findByText("ID").click();

      popover().within(() => {
        cy.findByRole("textbox").type("1{enter}");
        cy.button("Add filter").click();
      });

      cy.wait("@cardQuery");

      getDashboardCard(0).within(() => {
        getTableCell("ID", 0).should("contain", "1");
      });

      getDashboardCard(1).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });

      getDashboardCard(2).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });
    });
  });
});
function createDashboardWithCards({
  dashboardName = "my dash",
  cards = [],
} = {}) {
  return cy
    .createDashboard({ name: dashboardName })
    .then(({ body: { id } }) => {
      updateDashboardCards({
        dashboard_id: id,
        cards,
      });

      cy.wrap(id).as("dashboardId");
    });
}

function addCardToDashboard(dashcardNames = "Orders Model") {
  const dashcardsToSelect =
    typeof dashcardNames === "string" ? [dashcardNames] : dashcardNames;
  cy.findByTestId("dashboard-header").icon("add").click();
  for (const dashcardName of dashcardsToSelect) {
    cy.findByTestId("add-card-sidebar").findByText(dashcardName).click();
  }
}

function goToFilterMapping(name = "Text") {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function removeFilterFromDashCard(dashcardIndex = 0) {
  getDashboardCard(dashcardIndex).icon("close").click();
}

function getTableCell(columnName, rowIndex) {
  cy.findAllByTestId("column-header").then($columnHeaders => {
    const columnHeaderIndex = $columnHeaders
      .toArray()
      .findIndex($columnHeader => $columnHeader.textContent === columnName);
    const row = cy.findAllByTestId("table-row").eq(rowIndex);
    row.findAllByTestId("cell-data").eq(columnHeaderIndex).as("cellData");
  });

  return cy.get("@cellData");
}

function addQuestionFromQueryBuilder({
  questionId,
  saveDashboardAfterAdd = true,
}) {
  visitQuestion(questionId);

  openQuestionActions();
  popover().findByText("Add to dashboard").click();

  entityPickerModal().within(() => {
    modal().findByText("36275").click();
    cy.button("Select").click();
  });

  undoToast().findByRole("button", { name: "Auto-connect" }).click();
  undoToast().should("contain", "Undo");

  if (saveDashboardAfterAdd) {
    saveDashboard();
  }
}
