const { H } = cy;
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
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
  });

  describe("parameter mapping", () => {
    it("should wire parameters to cards with matching fields", () => {
      createDashboardWithCards({ cards }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      H.editDashboard();

      H.setFilter("Text or Category", "Is");

      H.selectDashboardFilter(H.getDashboardCard(0), "Name");

      H.getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      H.getDashboardCard(1).findByText("User.Name").should("not.exist");

      H.undoToast()
        .should(
          "contain",
          "Auto-connect this filter to all questions containing “User.Name”?",
        )
        .should("not.contain", "in the current tab")
        .findByText("Auto-connect")
        .click();
      H.undoToast().should(
        "contain",
        "The filter was auto-connected to all questions containing “User.Name”.",
      );

      cy.log("verify auto-connect info is shown");

      H.getDashboardCard(1).within(() => {
        cy.findByText("Auto-connected").should("be.visible");
        cy.icon("sparkles").should("be.visible");
      });

      // do not wait for timeout, but close the toast
      H.undoToast().icon("close").click();

      H.getDashboardCard(1).within(() => {
        cy.findByText("Auto-connected").should("not.exist");
        cy.icon("sparkles").should("not.exist");
      });

      cy.log("verify auto-wire suggestion when a card is replaced");

      goToFilterMapping();

      H.getDashboardCard(1)
        .realHover({ scrollBehavior: "bottom" })
        .findByLabelText("Replace")
        .click();

      H.modal().findByText("Orders, Count").click();

      H.undoToastList()
        .contains("Auto-connect “Orders, Count” to “Text”?")
        .closest("[data-testid='toast-undo']")
        .button("Auto-connect")
        .click();

      H.undoToastList().should(
        "contain",
        "“Orders, Count” was auto-connected to “Text”.",
      );

      goToFilterMapping();

      H.getDashboardCard(1).findByText("User.Name").should("exist");
    });

    it("should undo auto-wiring and not wire parameters to cards that already have a parameter, despite matching fields", () => {
      createDashboardWithCards({ cards }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      H.editDashboard();

      H.setFilter("Text or Category", "Is");

      H.selectDashboardFilter(H.getDashboardCard(0), "Name");

      H.getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      H.undoToast()
        .should(
          "contain",
          "Auto-connect this filter to all questions containing “User.Name”?",
        )
        .findByRole("button", { name: "Auto-connect" })
        .click();

      H.getDashboardCard(0).findByText("User.Name").should("exist");
      H.getDashboardCard(1).findByText("User.Name").should("exist");

      cy.log("verify undo functionality");
      H.undoToast().findByRole("button", { name: "Undo" }).click();

      H.getDashboardCard(0).findByText("User.Name").should("exist");
      H.getDashboardCard(1).findByText("Select…").should("exist");

      H.selectDashboardFilter(H.getDashboardCard(1), "Address");

      H.getDashboardCard(0).within(() => {
        cy.findByText("User.Name").should("exist");
      });

      H.getDashboardCard(1).within(() => {
        cy.findByText("User.Address").should("exist");
      });

      H.undoToast().should("not.exist");
    });

    it("should not suggest to wire parameters to cards that don't have a matching field", () => {
      H.createQuestion({
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
        }).then((dashboardId) => {
          H.visitDashboard(dashboardId);
        });
      });

      H.editDashboard();

      H.setFilter("Text or Category", "Is");

      H.selectDashboardFilter(H.getDashboardCard(0), "Name");

      H.undoToast().should("not.exist");
    });

    it("should dismiss auto-wire toasts on timeout, restarting the 12s timeout for a second suggestion toast", () => {
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

      createDashboardWithCards({ cards }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      H.editDashboard();

      cy.clock();

      H.setFilter("Text or Category", "Is");

      H.selectDashboardFilter(H.getDashboardCard(0), "Name");

      removeFilterFromDashCard(0);

      cy.tick(2000);

      H.selectDashboardFilter(H.getDashboardCard(0), "Name");

      // since we waited 2s earlier, if the toast is still visible after this other delay of 11s,
      // it means the first timeout of 12s was cleared correctly
      cy.tick(11000);
      H.undoToast().should("exist");

      cy.tick(2000);
      H.undoToast().should("not.exist");

      cy.log("verify the undo toast after auto-connect lasts 8s");

      removeFilterFromDashCard(0);

      H.selectDashboardFilter(H.getDashboardCard(0), "Name");
      cy.tick(1000);

      H.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      cy.tick(7000);
      H.undoToast().should("exist");

      cy.tick(2000);
      H.undoToast().should("not.exist");
    });

    describe("multiple tabs", () => {
      it("should not wire parameters to cards in different tabs", () => {
        createDashboardWithCards({ cards }).then((dashboardId) => {
          H.visitDashboardAndCreateTab({
            dashboardId,
            save: false,
          });
        });

        H.setFilter("Text or Category", "Is");

        addCardToDashboard();
        goToFilterMapping();

        H.selectDashboardFilter(H.getDashboardCard(0), "Name");

        H.getDashboardCard(0).findByText("User.Name").should("exist");

        H.undoToast().should("not.exist");

        H.goToTab("Tab 1");

        for (let i = 0; i < cards.length; i++) {
          H.getDashboardCard(i).findByText("User.Name").should("not.exist");
        }

        H.selectDashboardFilter(H.getDashboardCard(0), "Name");

        cy.log("verify prefix 'in the current tab'");
        H.undoToast().should(
          "contain",
          "Auto-connect this filter to all questions containing “User.Name”, in the current tab?",
        );
      });
    });
  });

  describe("add a card", () => {
    it("should wire parameters to cards that are added to the dashboard and undo it", () => {
      createDashboardWithCards({ cards }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      H.editDashboard();

      H.setFilter("Text or Category", "Is");

      H.selectDashboardFilter(H.getDashboardCard(0), "Name");
      H.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      for (let i = 0; i < cards.length; i++) {
        H.getDashboardCard(i).findByText("User.Name").should("exist");
      }

      addCardToDashboard();
      goToFilterMapping();

      H.undoToastList()
        .eq(1)
        .should("contain", "Auto-connect “Orders Model” to “Text”?")
        .findByRole("button", { name: "Auto-connect" })
        .click();

      H.undoToastList()
        .eq(1)
        .should("contain", "“Orders Model” was auto-connected to “Text”.");

      for (let i = 0; i < cards.length + 1; i++) {
        H.getDashboardCard(i).findByText("User.Name").should("exist");
      }

      cy.log("verify undo functionality");
      H.undoToastList().eq(1).findByText("Undo").click();

      H.getDashboardCard(0).findByText("User.Name").should("exist");
      H.getDashboardCard(1).findByText("User.Name").should("exist");
      H.getDashboardCard(2).findByText("Select…").should("exist");
    });

    describe("multiple tabs", () => {
      it("should not wire parameters to cards that are added to the dashboard in a different tab", () => {
        createDashboardWithCards({ cards }).then((dashboardId) => {
          H.visitDashboard(dashboardId);
        });

        H.editDashboard();

        H.setFilter("Number", "Equal to");
        H.setFilter("Text or Category", "Is");

        H.selectDashboardFilter(H.getDashboardCard(0), "Name");

        H.undoToast()
          .should(
            "contain",
            "Auto-connect this filter to all questions containing",
          )
          .findByRole("button", { name: "Auto-connect" })
          .click();

        for (let i = 0; i < cards.length; i++) {
          H.getDashboardCard(i).findByText("User.Name").should("exist");
        }

        H.createNewTab();
        addCardToDashboard();
        goToFilterMapping();

        H.getDashboardCard(0).findByText("User.Name").should("not.exist");

        cy.log(
          "verify that no new toast with suggestion to auto-wire appeared",
        );

        H.undoToastList()
          .should("have.length", 1)
          .should(
            "contain",
            "The filter was auto-connected to all questions containing “User.Name”",
          );

        H.selectDashboardFilter(H.getDashboardCard(0), "Name");
        goToFilterMapping("Number");
        H.selectDashboardFilter(H.getDashboardCard(0), "Total");

        addCardToDashboard();

        H.undoToastList().eq(1).findByText("Auto-connect").click();

        cy.log("verify that toast shows number of filters that were connected");

        H.undoToastList()
          .eq(1)
          .should("contain", "“Orders Model” was auto-connected to 2 filters.");
      });
    });
  });

  describe("adding cards with foreign keys to the dashboard (metabase#36275)", () => {
    beforeEach(() => {
      cy.intercept(
        "POST",
        "/api/dashboard/*/dashcard/*/card/*/query",
        cy.spy().as("cardQueryRequest"),
      ).as("cardQuery");

      H.createQuestion({
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

      cy.wait("@cardQuery");

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

      H.dashboardParametersContainer().findByText("ID").click();

      H.dashboardParametersPopover().within(() => {
        H.fieldValuesCombobox().type("1,");
        cy.button("Add filter").click();
      });

      cy.wait("@cardQuery");

      H.getDashboardCard(0).within(() => {
        getTableCell("ID", 0).should("contain", "1");
      });

      H.getDashboardCard(1).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });

      H.getDashboardCard(2).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });
    });

    it("should auto-wire and filter cards with foreign keys when added to the dashboard via the query builder", () => {
      H.visitDashboard("@dashboardId");
      H.editDashboard();
      H.setFilter("ID");
      H.selectDashboardFilter(H.getDashboardCard(0), "ID");
      H.saveDashboard();

      cy.get("@ordersQuestionId").then((ordersQuestionId) => {
        addQuestionFromQueryBuilder({ questionId: ordersQuestionId });
      });

      cy.get("@reviewsQuestionId").then((reviewsQuestionId) => {
        addQuestionFromQueryBuilder({
          questionId: reviewsQuestionId,
          saveDashboardAfterAdd: false,
        });
      });

      cy.wait("@cardQuery");

      goToFilterMapping("ID");

      H.getDashboardCard(0).findByText("Products.ID").should("exist");
      H.getDashboardCard(1).findByText("Product.ID").should("exist");
      H.getDashboardCard(2).findByText("Product.ID").should("exist");

      H.saveDashboard();

      H.dashboardParametersContainer().findByText("ID").click();

      H.dashboardParametersPopover().within(() => {
        H.fieldValuesCombobox().type("1,");
        cy.button("Add filter").click();
      });

      cy.wait("@cardQuery");

      H.getDashboardCard(0).within(() => {
        getTableCell("ID", 0).should("contain", "1");
      });

      H.getDashboardCard(1).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });

      H.getDashboardCard(2).within(() => {
        getTableCell("Product ID", 0).should("contain", "1");
      });
    });
  });

  describe("dismiss toasts", () => {
    it("should dismiss auto-wire toasts on filter removal", () => {
      createDashboardWithCards({ cards }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      H.editDashboard();
      H.setFilter("Text or Category", "Is");

      H.selectDashboardFilter(H.getDashboardCard(0), "Name");

      H.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      addCardToDashboard();

      H.undoToastList()
        .contains("Auto-connect “Orders Model” to “Text”?")
        .should("be.visible");

      removeFilterFromDashboard();

      H.undoToast().should("not.exist");
    });

    it("should dismiss auto-wire toasts on card removal", () => {
      createDashboardWithCards({ cards }).then((dashboardId) => {
        H.visitDashboard(dashboardId);
      });

      H.editDashboard();
      H.setFilter("Text or Category", "Is");

      H.selectDashboardFilter(H.getDashboardCard(0), "Name");

      H.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      addCardToDashboard();

      H.undoToastList()
        .contains("Auto-connect “Orders Model” to “Text”?")
        .should("be.visible");

      H.removeDashboardCard(2);

      H.undoToastList()
        .should("have.length", 1)
        .should("contain", "Removed card");
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
    const getParameterMappings = (card) => [
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
    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails],
    }).then(({ dashboard, questions: [card] }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card.id,
            parameter_mappings: getParameterMappings(card),
          },
        ],
      });
      H.visitDashboard(dashboard.id);
    });

    cy.log("add a card to the dashboard and auto-wire");
    H.editDashboard();
    H.openQuestionsSidebar();
    cy.findByTestId("add-card-sidebar")
      .findByText(questionDetails.name)
      .click();
    H.undoToast().button("Auto-connect").click();

    cy.log("check auto-wired parameter mapping");
    cy.findByTestId("fixed-width-filters")
      .findByText(sourceParameter.name)
      .click();
    H.getDashboardCard(1).findByText("User.Source").should("be.visible");
    cy.findByTestId("fixed-width-filters")
      .findByText(categoryParameter.name)
      .click();
    H.getDashboardCard(1).findByText("Product.Category").should("be.visible");
  });
});

function createDashboardWithCards({
  dashboardName = "my dash",
  cards = [],
} = {}) {
  return H.createDashboard({ name: dashboardName }).then(({ body: { id } }) => {
    H.updateDashboardCards({
      dashboard_id: id,
      cards,
    });

    cy.wrap(id).as("dashboardId");
  });
}

function addCardToDashboard(dashcardNames = "Orders Model") {
  const dashcardsToSelect =
    typeof dashcardNames === "string" ? [dashcardNames] : dashcardNames;
  H.openQuestionsSidebar();
  for (const dashcardName of dashcardsToSelect) {
    cy.findByTestId("add-card-sidebar").findByText(dashcardName).click();
  }
}

function removeFilterFromDashboard(filterName = "Text") {
  goToFilterMapping(filterName);

  H.sidebar().findByRole("button", { name: "Remove" }).click();
}

function goToFilterMapping(name = "Text") {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .findByText(name)
    .click();
}

function removeFilterFromDashCard(dashcardIndex = 0) {
  H.getDashboardCard(dashcardIndex).icon("close").click();
}

function getTableCell(columnName, rowIndex) {
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
