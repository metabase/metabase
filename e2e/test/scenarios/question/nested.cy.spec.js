const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ordersJoinProductsQuery = {
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
};

describe("scenarios > question > nested", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("'distribution' should work on a joined table from a saved question (metabase#14787)", () => {
    // Set the display really wide and really tall to avoid any scrolling
    cy.viewport(1600, 1200);
    cy.intercept("POST", "/api/dataset").as("dataset");

    const baseQuestionDetails = {
      name: "14787",
      query: { ...ordersJoinProductsQuery, limit: 5 },
    };

    createNestedQuestion({ baseQuestionDetails });

    // The column title
    H.tableHeaderClick("Products → Category");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Distribution").click();
    cy.wait("@dataset");

    H.summarize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Group by")
      .parent()
      .within(() => {
        cy.log("Regression that worked on 0.37.9");
        isSelected("Products → Category");
      });

    // Although the test will fail on the previous step, we're including additional safeguards against regressions once the issue is fixed
    // It can potentially fail at two more places. See [1] and [2]
    H.openNotebook();
    cy.findAllByTestId("notebook-cell-item")
      .contains(/^Products → Category$/) /* [1] */
      .click();
    H.popover().within(() => {
      isSelected("Products → Category"); /* [2] */
    });

    /**
     * Helper function related to this test only
     * TODO:
     *  Extract it if we have the need for it anywhere else
     */
    function isSelected(text) {
      H.getDimensionByName({ name: text }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    }
  });

  describe("should not remove user defined metric when summarizing based on saved question (metabase#15725)", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      H.createNativeQuestion({
        name: "15725",
        native: { query: "select 'A' as cat, 5 as val" },
      });
      // Window object gets recreated for every `cy.visit`
      // See: https://stackoverflow.com/a/65218352/8815185
      cy.visit("/", {
        onBeforeLoad(win) {
          cy.spy(win.console, "warn").as("consoleWarn");
        },
      });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Question").should("be.visible").click();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("15725").click();
      });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a function or metric").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of rows").click();
    });

    it("Count of rows AND Sum of VAL by CAT (metabase#15725-1)", () => {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.icon("add").last().click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Sum of/).click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("VAL").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sum of VAL");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("CAT").click();

      H.visualize();

      cy.get("@consoleWarn").should(
        "not.be.calledWith",
        "Removing invalid MBQL clause",
      );
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sum of VAL");
    });

    it("Count of rows by CAT + add sum of VAL later from the sidebar (metabase#15725-2)", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("CAT").click();

      H.visualize();

      H.summarize();
      cy.findByTestId("add-aggregation-button").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Sum of/).click();
      H.popover().findByText("VAL").click();
      cy.wait("@dataset").then((xhr) => {
        expect(xhr.response.body.error).not.to.exist;
      });
      cy.get("@consoleWarn").should(
        "not.be.calledWith",
        "Removing invalid MBQL clause",
      );
    });
  });

  it("should properly work with native questions (metabase#15808, metabase#16938, metabase#18364)", () => {
    const questionDetails = {
      name: "15808",
      native: { query: "select * from products limit 3" },
    };

    H.createNativeQuestion(questionDetails, { visitQuestion: true });
    cy.findAllByTestId("cell-data").should(
      "contain",
      "Swaniawski, Casper and Hilll",
    );

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.findByTestId("qb-header-action-panel")
      .findByText("Explore results")
      .click();
    cy.wait("@dataset");

    cy.log(
      "Should allow to browse object details when exploring native query results (metabase#16938)",
    );
    cy.get(".test-Table-ID").as("primaryKeys").should("have.length", 3);
    cy.get("@primaryKeys").first().click();

    cy.findByTestId("object-detail").should(
      "contain",
      "Swaniawski, Casper and Hilll",
    );
    cy.findByLabelText("Close").click();

    cy.log("Should be able to save a nested question (metabase#18364)");
    saveQuestion();

    cy.log(
      "Should be able to use integer filter on a nested query based on a saved native question (metabase#15808)",
    );
    H.filter();
    H.popover().findByText("RATING").click();
    H.selectFilterOperator("Equal to");
    H.popover().within(() => {
      cy.findByLabelText("Filter value").type("4");
      cy.button("Apply filter").click();
    });

    cy.findAllByTestId("cell-data")
      .should("contain", "Murray, Watsica and Wunsch")
      .and("not.contain", "Swaniawski, Casper and Hilll");

    function saveQuestion() {
      cy.intercept("POST", "/api/card").as("cardCreated");

      H.saveQuestionToCollection();

      cy.wait("@cardCreated").then(({ response: { body } }) => {
        expect(body.error).not.to.exist;
      });

      cy.button("Failed").should("not.exist");
    }
  });
});

function createNestedQuestion(
  { baseQuestionDetails, nestedQuestionDetails = {} },
  { loadBaseQuestionMetadata = false, visitNestedQuestion = true } = {},
) {
  if (!baseQuestionDetails) {
    throw new Error("Please provide the base question details");
  }

  createBaseQuestion(baseQuestionDetails).then(({ body: { id } }) => {
    if (loadBaseQuestionMetadata) {
      H.visitQuestion(id);
    }

    const { query: nestedQuery, ...details } = nestedQuestionDetails;

    const composite = {
      name: "Nested Question",
      query: {
        ...nestedQuery,
        "source-table": `card__${id}`,
      },
      ...details,
    };

    return H.createQuestion(composite, {
      visitQuestion: visitNestedQuestion,
      wrapId: true,
      idAlias: "nestedQuestionId",
    });
  });

  function createBaseQuestion(query) {
    return query.native
      ? H.createNativeQuestion(query)
      : H.createQuestion(query);
  }
}
