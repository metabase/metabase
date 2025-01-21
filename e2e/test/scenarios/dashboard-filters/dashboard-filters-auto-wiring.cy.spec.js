import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

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
    size_y: 5,
  },
];

describe("dashboard filters auto-wiring", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
  });

  describe("parameter mapping", () => {
    it("should wire parameters to cards with matching fields", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();

      cy.setFilter("Text or Category", "Is");

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      cy.getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      cy.getDashboardCard(1).findByText("User.Name").should("not.exist");

      cy.undoToast()
        .should(
          "contain",
          "Auto-connect this filter to all questions containing “User.Name”?",
        )
        .should("not.contain", "in the current tab")
        .findByText("Auto-connect")
        .click();
      cy.undoToast().should(
        "contain",
        "The filter was auto-connected to all questions containing “User.Name”.",
      );

      cy.log("verify auto-connect info is shown");

      cy.getDashboardCard(1).within(() => {
        cy.findByText("Auto-connected").should("be.visible");
        cy.icon("sparkles").should("be.visible");
      });

      // do not wait for timeout, but close the toast
      cy.undoToast().icon("close").click();

      cy.getDashboardCard(1).within(() => {
        cy.findByText("Auto-connected").should("not.exist");
        cy.icon("sparkles").should("not.exist");
      });
    });

    it("should not wire parameters to cards that already have a parameter, despite matching fields", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();

      cy.setFilter("Text or Category", "Is");

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      cy.getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      cy.undoToast()
        .should(
          "contain",
          "Auto-connect this filter to all questions containing “User.Name”?",
        )
        .findByRole("button", { name: "Auto-connect" })
        .click();

      cy.getDashboardCard(1).within(() => {
        cy.findByLabelText("close icon").click();
      });

      cy.selectDashboardFilter(cy.getDashboardCard(1), "Address");

      cy.getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      cy.getDashboardCard(1).within(() => {
        cy.findByText("User.Address").should("exist");
      });

      cy.undoToast().should("contain", "Undo");
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
          cy.visitDashboard(dashboardId);
        });
      });

      cy.editDashboard();

      cy.setFilter("Text or Category", "Is");

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      cy.undoToast().should("not.exist");
    });

    it("should undo parameter wiring when 'Undo' is clicked", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();

      cy.setFilter("Text or Category", "Is");
      addCardToDashboard();
      goToFilterMapping();

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      cy.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      cy.getDashboardCard(0).findByText("User.Name").should("exist");

      for (let i = 0; i < cards.length; i++) {
        cy.getDashboardCard(i).findByText("User.Name").should("exist");
      }

      cy.undoToast().findByRole("button", { name: "Undo" }).click();

      cy.getDashboardCard(0).findByText("User.Name").should("exist");
      for (let i = 1; i < cards.length; i++) {
        cy.getDashboardCard(i).findByText("Select…").should("exist");
      }
    });

    it("in case of two auto-wiring undo toast, the second one should last the default timeout of 12s", () => {
      // The auto-wiring undo toasts use the same id, a bug in the undo logic caused the second toast to be dismissed by the
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
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();

      cy.clock();

      cy.setFilter("Text or Category", "Is");

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      removeFilterFromDashCard(0);

      cy.tick(2000);

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      // since we waited 2s earlier, if the toast is still visible after this other delay of 11s,
      // it means the first timeout of 12s was cleared correctly
      cy.tick(11000);
      cy.undoToast().should("exist");

      cy.tick(2000);
      cy.undoToast().should("not.exist");
    });

    describe("multiple tabs", () => {
      it("should not wire parameters to cards in different tabs", () => {
        createDashboardWithCards({ cards }).then(dashboardId => {
          cy.visitDashboardAndCreateTab({
            dashboardId,
            save: false,
          });
        });

        cy.setFilter("Text or Category", "Is");

        addCardToDashboard();
        goToFilterMapping();

        cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

        cy.getDashboardCard(0).findByText("User.Name").should("exist");

        cy.undoToast().should("not.exist");

        cy.goToTab("Tab 1");

        for (let i = 0; i < cards.length; i++) {
          cy.getDashboardCard(i).findByText("User.Name").should("not.exist");
        }

        cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

        cy.log("verify prefix 'in the current tab'");
        cy.undoToast().should(
          "contain",
          "Auto-connect this filter to all questions containing “User.Name”, in the current tab?",
        );
      });
    });
  });

  describe("add a card", () => {
    it("should wire parameters to cards that are added to the dashboard", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();

      cy.setFilter("Text or Category", "Is");

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");
      cy.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      for (let i = 0; i < cards.length; i++) {
        cy.getDashboardCard(i).findByText("User.Name").should("exist");
      }

      addCardToDashboard();

      cy.log("verify toast text and enable auto-connect");

      cy.undoToastList()
        .eq(1)
        .should("contain", "Auto-connect “Orders Model” to “Text”?")
        .findByRole("button", { name: "Auto-connect" })
        .click();

      cy.log("verify toast text after auto-connect");

      cy.undoToastList()
        .eq(1)
        .should("contain", "“Orders Model” was auto-connected to “Text”.");

      goToFilterMapping();

      for (let i = 0; i < cards.length + 1; i++) {
        cy.getDashboardCard(i).findByText("User.Name").should("exist");
      }

      cy.undoToastList()
        .eq(1)
        .findByText("“Orders Model” was auto-connected to “Text”.")
        .should("be.visible");
    });

    it("should undo parameter wiring when 'Undo' is clicked", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();

      cy.setFilter("Text or Category", "Is");

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");
      cy.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      for (let i = 0; i < cards.length; i++) {
        cy.getDashboardCard(i).findByText("User.Name").should("exist");
      }

      addCardToDashboard();
      goToFilterMapping();

      cy.undoToastList()
        .eq(1)
        .should("contain", "Auto-connect “Orders Model” to “Text”?")
        .findByRole("button", { name: "Auto-connect" })
        .click();

      for (let i = 0; i < cards.length + 1; i++) {
        cy.getDashboardCard(i).findByText("User.Name").should("exist");
      }

      cy.log("verify undo functionality");
      cy.undoToastList().eq(1).findByText("Undo").click();

      cy.getDashboardCard(0).findByText("User.Name").should("exist");
      cy.getDashboardCard(1).findByText("User.Name").should("exist");
      cy.getDashboardCard(2).findByText("Select…").should("exist");
    });

    describe("multiple tabs", () => {
      it("should not wire parameters to cards that are added to the dashboard in a different tab", () => {
        createDashboardWithCards({ cards }).then(dashboardId => {
          cy.visitDashboard(dashboardId);
        });

        cy.editDashboard();

        cy.setFilter("Number", "Equal to");
        cy.setFilter("Text or Category", "Is");

        cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

        cy.undoToast()
          .should(
            "contain",
            "Auto-connect this filter to all questions containing",
          )
          .findByRole("button", { name: "Auto-connect" })
          .click();

        for (let i = 0; i < cards.length; i++) {
          cy.getDashboardCard(i).findByText("User.Name").should("exist");
        }

        cy.createNewTab();
        addCardToDashboard();
        goToFilterMapping();

        cy.getDashboardCard(0).findByText("User.Name").should("not.exist");

        cy.log(
          "verify that no new toast with suggestion to auto-wire appeared",
        );

        cy.undoToastList()
          .should("have.length", 1)
          .should(
            "contain",
            "The filter was auto-connected to all questions containing “User.Name”",
          );

        cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");
        goToFilterMapping("Equal to");
        cy.selectDashboardFilter(cy.getDashboardCard(0), "Total");

        addCardToDashboard();

        cy.undoToastList().eq(1).findByText("Auto-connect").click();

        cy.log("verify that toast shows number of filters that were connected");

        cy.undoToastList()
          .eq(1)
          .should("contain", "“Orders Model” was auto-connected to 2 filters.");
      });
    });
  });

  describe("replace a card", () => {
    it("should show auto-wire suggestion toast when a card is replaced", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();

      cy.setFilter("Text or Category", "Is");

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      cy.undoToast().findByText("Auto-connect").click();

      goToFilterMapping();

      cy.findDashCardAction(cy.getDashboardCard(1), "Replace").click();

      cy.modal().findByText("Orders, Count").click();

      cy.undoToastList()
        .eq(2)
        .should("contain", "Auto-connect “Orders, Count” to “Text”?")
        .button("Auto-connect")
        .click();

      cy.undoToastList()
        .eq(2)
        .should("contain", "“Orders, Count” was auto-connected to “Text”.");
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

    it("should auto-wire and filter cards with foreign keys when added to the dashboard via the sidebar", () => {
      cy.visitDashboard("@dashboardId");
      cy.editDashboard();
      cy.setFilter("ID");
      cy.selectDashboardFilter(cy.getDashboardCard(0), "ID");

      addCardToDashboard(["Orders Question", "Reviews Question"]);

      cy.wait("@cardQuery");

      goToFilterMapping("ID");

      cy.undoToastList()
        .findByText("Auto-connect “Orders Question” to “ID”?")
        .closest("[data-testid='toast-undo']")
        .findByRole("button", { name: "Auto-connect" })
        .click();

      cy.undoToastList()
        .findByText("Auto-connect “Reviews Question” to “ID”?")
        .closest("[data-testid='toast-undo']")
        .findByRole("button", { name: "Auto-connect" })
        .click();

      cy.getDashboardCard(0).findByText("Products.ID").should("exist");
      cy.getDashboardCard(1).findByText("Product.ID").should("exist");
      cy.getDashboardCard(2).findByText("Product.ID").should("exist");

      cy.saveDashboard();

      cy.dashboardParametersContainer().findByText("ID").click();

      cy.popover().within(() => {
        cy.fieldValuesInput().type("1,");
        cy.button("Add filter").click();
      });

      cy.wait("@cardQuery");

      cy.getDashboardCard(0).within(() => {
        getTableCell("ID", 0).should("contain", "1");
      });

      cy.getDashboardCard(1).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });

      cy.getDashboardCard(2).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });
    });

    it("should auto-wire and filter cards with foreign keys when added to the dashboard via the query builder", () => {
      cy.visitDashboard("@dashboardId");
      cy.editDashboard();
      cy.setFilter("ID");
      cy.selectDashboardFilter(cy.getDashboardCard(0), "ID");
      cy.saveDashboard();

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

      cy.getDashboardCard(0).findByText("Products.ID").should("exist");
      cy.getDashboardCard(1).findByText("Product.ID").should("exist");
      cy.getDashboardCard(2).findByText("Product.ID").should("exist");

      cy.saveDashboard();

      cy.dashboardParametersContainer().findByText("ID").click();

      cy.popover().within(() => {
        cy.fieldValuesInput().type("1,");
        cy.button("Add filter").click();
      });

      cy.wait("@cardQuery");

      cy.getDashboardCard(0).within(() => {
        getTableCell("ID", 0).should("contain", "1");
      });

      cy.getDashboardCard(1).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });

      cy.getDashboardCard(2).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });
    });
  });

  describe("dismiss toasts", () => {
    it("should dismiss auto-wire toasts on filter removal", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();
      cy.setFilter("Text or Category", "Is");

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      cy.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      addCardToDashboard();

      cy.undoToastList()
        .contains("Auto-connect “Orders Model” to “Text”?")
        .should("be.visible");

      removeFilterFromDashboard();

      cy.undoToast().should("not.exist");
    });

    it("should dismiss auto-wire toasts on card removal", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();
      cy.setFilter("Text or Category", "Is");

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      cy.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      addCardToDashboard();

      cy.undoToastList()
        .contains("Auto-connect “Orders Model” to “Text”?")
        .should("be.visible");

      cy.removeDashboardCard(2);

      cy.undoToastList()
        .should("have.length", 1)
        .should("contain", "Removed card");
    });

    it("should dismiss toasts on timeout", () => {
      createDashboardWithCards({ cards }).then(dashboardId => {
        cy.visitDashboard(dashboardId);
      });

      cy.editDashboard();
      cy.setFilter("Text or Category", "Is");

      cy.clock();
      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      cy.undoToast().should("be.visible");

      // AUTO_WIRE_TOAST_TIMEOUT
      cy.tick(12000);

      cy.undoToast().should("not.exist");

      removeFilterFromDashCard(0);

      cy.selectDashboardFilter(cy.getDashboardCard(0), "Name");

      cy.clock();
      cy.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      cy.undoToast().should("be.visible");

      // AUTO_WIRE_UNDO_TOAST_TIMEOUT
      cy.tick(8000);
      cy.undoToast().should("not.exist");
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
      cy.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card.id,
            parameter_mappings: getParameterMappings(card),
          },
        ],
      });
      cy.visitDashboard(dashboard.id);
    });

    cy.log("add a card to the dashboard and auto-wire");
    cy.editDashboard();
    cy.openQuestionsSidebar();
    cy.findByTestId("add-card-sidebar")
      .findByText(questionDetails.name)
      .click();
    cy.undoToast().button("Auto-connect").click();

    cy.log("check auto-wired parameter mapping");
    cy.findByTestId("fixed-width-filters")
      .findByText(sourceParameter.name)
      .click();
    cy.getDashboardCard(1).findByText("User.Source").should("be.visible");
    cy.findByTestId("fixed-width-filters")
      .findByText(categoryParameter.name)
      .click();
    cy.getDashboardCard(1).findByText("Product.Category").should("be.visible");
  });
});

function createDashboardWithCards({
  dashboardName = "my dash",
  cards = [],
} = {}) {
  return cy
    .createDashboard({ name: dashboardName })
    .then(({ body: { id } }) => {
      cy.updateDashboardCards({
        dashboard_id: id,
        cards,
      });

      cy.wrap(id).as("dashboardId");
    });
}

function addCardToDashboard(dashcardNames = "Orders Model") {
  const dashcardsToSelect =
    typeof dashcardNames === "string" ? [dashcardNames] : dashcardNames;
  cy.openQuestionsSidebar();
  for (const dashcardName of dashcardsToSelect) {
    cy.findByTestId("add-card-sidebar").findByText(dashcardName).click();
  }
}

function removeFilterFromDashboard(filterName = "Text") {
  goToFilterMapping(filterName);

  cy.sidebar().findByRole("button", { name: "Remove" }).click();
}

function goToFilterMapping(name = "Text") {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function removeFilterFromDashCard(dashcardIndex = 0) {
  cy.getDashboardCard(dashcardIndex).icon("close").click();
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
  cy.visitQuestion(questionId);

  cy.openQuestionActions();
  cy.popover().findByText("Add to dashboard").click();

  cy.entityPickerModal().within(() => {
    cy.modal().findByText("Dashboards").click();
    cy.modal().findByText("36275").click();
    cy.button("Select").click();
  });

  cy.undoToast().findByRole("button", { name: "Auto-connect" }).click();
  cy.undoToast().should("contain", "Undo");

  if (saveDashboardAfterAdd) {
    cy.saveDashboard();
  }
}
