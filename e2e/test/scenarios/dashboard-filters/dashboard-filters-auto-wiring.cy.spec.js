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
  setFilter,
  visitQuestion,
  modal,
  dashboardParametersContainer,
  openQuestionActions,
  entityPickerModal,
  dashboardHeader,
} from "e2e/support/helpers";

const { ORDERS_ID, PRODUCTS_ID, REVIEWS_ID, ORDERS, PEOPLE, PRODUCTS } =
  SAMPLE_DATABASE;

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
    it("should automatically wire parameters to cards with matching fields", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");

      getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      getDashboardCard(1).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      undoToast()
        .findByText(
          "This filter has been auto-connected with questions with the same field.",
        )
        .should("be.visible");
    });

    it("should not automatically wire parameters to cards that already have a parameter, despite matching fields", () => {
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
        .findByText(
          "This filter has been auto-connected with questions with the same field.",
        )
        .should("be.visible");

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

      undoToast().should("not.exist");
    });

    it("should not automatically wire parameters to cards that don't have a matching field", () => {
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

      getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      getDashboardCard(1).within(() => {
        cy.findByText("Select…").should("exist");
      });

      undoToast().should("not.exist");
    });

    it("should autowire parameters to cards in different tabs", () => {
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

      goToTab("Tab 1");

      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      undoToast()
        .findByText(
          "This filter has been auto-connected with questions with the same field.",
        )
        .should("be.visible");
    });

    it("should undo parameter wiring when 'Undo auto-connection' is clicked", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");
      addCardToDashboard();
      goToFilterMapping();

      selectDashboardFilter(getDashboardCard(0), "Name");

      getDashboardCard(0).findByText("User.Name").should("exist");

      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      undoToast().findByText("Undo auto-connection").click();

      getDashboardCard(0).findByText("User.Name").should("exist");
      for (let i = 1; i < cards.length; i++) {
        getDashboardCard(i).findByText("Select…").should("exist");
      }
    });

    it("in case of two autowiring undo toast, the second one should last the default timeout of 5s", () => {
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
      removeFilterFromDashCard(1);

      cy.tick(2000);

      selectDashboardFilter(getDashboardCard(0), "Name");

      // since we waited 2 seconds earlier, if the toast is still visible after this other delay of 4s,
      // it means the first timeout of 5s was cleared correctly
      cy.tick(4000);
      undoToast().should("exist");

      cy.tick(2000);

      undoToast().should("not.exist");
    });
  });

  describe("wiring parameters when adding a card", () => {
    it("should automatically wire a parameters to cards that are added to the dashboard", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");

      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      addCardToDashboard();
      goToFilterMapping();

      for (let i = 0; i < cards.length + 1; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      undoToast()
        .findByText(
          "Orders Model has been auto-connected with filters with the same field.",
        )
        .should("be.visible");
    });

    it("should automatically wire parameters to cards that are added to the dashboard in a different tab", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");
      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      createNewTab();
      addCardToDashboard();
      goToFilterMapping();

      getDashboardCard(0).findByText("User.Name").should("exist");

      undoToast()
        .findByText(
          "Orders Model has been auto-connected with filters with the same field.",
        )
        .should("be.visible");
    });

    it("should undo parameter wiring when 'Undo auto-connection' is clicked", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      setFilter("Text or Category", "Is");

      selectDashboardFilter(getDashboardCard(0), "Name");

      for (let i = 0; i < cards.length; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      addCardToDashboard();
      goToFilterMapping();

      for (let i = 0; i < cards.length + 1; i++) {
        getDashboardCard(i).findByText("User.Name").should("exist");
      }

      undoToast().findByText("Undo auto-connection").click();

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

  it("should auto-wire a new card to correct parameter targets (metabase#44720)", () => {
    cy.log("create a dashboard with 2 parameters mapped to the same card");
    const questionDetails = {
      name: "Test",
      query: {
        "source-table": ORDERS_ID,
      },
    };
    const sourceParameter = {
      name: "Source",
      slug: "source",
      id: "27454068",
      type: "string/=",
      sectionId: "string",
    };
    const categoryParameter = {
      name: "Category",
      slug: "category",
      id: "27454069",
      type: "string/=",
      sectionId: "string",
    };
    const dashboardDetails = {
      parameters: [sourceParameter, categoryParameter],
    };
    const getParameterMappings = card => [
      {
        card_id: card.id,
        parameter_id: sourceParameter.id,
        target: [
          "dimension",
          ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
        ],
      },
      {
        card_id: card.id,
        parameter_id: categoryParameter.id,
        target: [
          "dimension",
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
    ];
    cy.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails],
    }).then(({ dashboard, questions: [card] }) => {
      updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card.id,
            parameter_mappings: getParameterMappings(card),
          },
        ],
      });
      visitDashboard(dashboard.id);
    });

    cy.log("add a card to the dashboard and auto-wire");
    editDashboard();
    dashboardHeader().icon("add").click();
    cy.findByTestId("add-card-sidebar")
      .findByText(questionDetails.name)
      .click();

    cy.log("check auto-wired parameter mapping");
    cy.findByTestId("fixed-width-filters")
      .findByText(sourceParameter.name)
      .click();
    getDashboardCard(1).findByText("User.Source").should("be.visible");
    cy.findByTestId("fixed-width-filters")
      .findByText(categoryParameter.name)
      .click();
    getDashboardCard(1).findByText("Product.Category").should("be.visible");
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

  undoToast().should("be.visible");
  if (saveDashboardAfterAdd) {
    saveDashboard();
  }
}
