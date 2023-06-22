import {
  restore,
  filterWidget,
  popover,
  visitDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > title drill", () => {
  describe("on a native question without connected dashboard parameters", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      const questionDetails = {
        name: "Q1",
        native: { query: 'SELECT 1 as "foo", 2 as "bar"' },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["foo"],
          "graph.metrics": ["bar"],
        },
      };

      cy.createNativeQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          visitDashboard(dashboard_id);
        },
      );
    });

    describe("as a user with access to underlying data", () => {
      it("should let you click through the title to the query builder (metabase#13042)", () => {
        // wait for qustion to load
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("foo");

        // drill through title
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Q1").click();

        // check that we're in the QB now
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("This question is written in SQL.");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("foo");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("bar");
      });
    });

    describe("as a user without access to the underlying data", () => {
      beforeEach(() => {
        cy.signIn("nodata");
        cy.reload();
      });

      it("should let you click through the title to the query builder (metabase#13042)", () => {
        // wait for qustion to load
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("foo");

        // drill through title
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Q1").click();

        // check that we're in the QB now
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("This question is written in SQL.");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("foo");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("bar");
      });
    });
  });

  describe("on a native question with a connected dashboard parameter", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      const filter = {
        name: "Text contains",
        slug: "text_contains",
        id: "98289b9b",
        type: "string/contains",
        sectionId: "string",
      };

      const questionDetails = {
        name: "16181",
        native: {
          query: "select count(*) from products where {{filter}}",
          "template-tags": {
            filter: {
              id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
              name: "filter",
              "display-name": "Filter",
              type: "dimension",
              dimension: ["field", PRODUCTS.TITLE, null],
              "widget-type": "string/contains",
              default: null,
            },
          },
        },
        display: "scalar",
      };

      const dashboardDetails = { parameters: [filter] };

      cy.createNativeQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        // Connect filter to the card
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 6,
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["template-tag", "filter"]],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard_id);
        checkScalarResult("200");
      });
    });

    describe("as a user with access to underlying data", () => {
      it("'contains' filter should still work after title drill through IF the native question field filter's type matches exactly (metabase#16181)", () => {
        checkScalarResult("200");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Text contains").click();
        cy.findByPlaceholderText("Enter some text").type("bb").blur();
        cy.button("Add filter").click();

        checkFilterLabelAndValue("Text contains", "bb");
        checkScalarResult("12");

        // Drill through on the quesiton's title
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("16181").click();

        checkFilterLabelAndValue("Filter", "bb");
        checkScalarResult("12");
      });
    });

    describe("as a user without access to underlying data", () => {
      beforeEach(() => {
        cy.signIn("nodata");
        cy.reload();
      });

      it("'contains' filter should still work after title drill through IF the native question field filter's type matches exactly (metabase#16181)", () => {
        checkScalarResult("200");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Text contains").click();
        cy.findByPlaceholderText("Enter some text").type("bb").blur();
        cy.button("Add filter").click();

        checkFilterLabelAndValue("Text contains", "bb");
        checkScalarResult("12");

        // Drill through on the quesiton's title
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("16181").click();

        checkFilterLabelAndValue("Filter", "bb");
        checkScalarResult("12");
      });
    });
  });

  describe("on a simple question with a connected dashboard parameter", () => {
    const questionDetails = {
      name: "GUI Question",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "pie",
    };

    const filterWithDefaultValue = {
      name: "Category",
      slug: "category",
      id: "c32a49e1",
      type: "category",
      default: ["Doohickey"],
    };

    const filter = { name: "ID", slug: "id", id: "f2bf003c", type: "id" };

    const dashboardDetails = {
      parameters: [filterWithDefaultValue, filter],
    };

    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashboardCard }) => {
          const { card_id, dashboard_id } = dashboardCard;

          const mapFiltersToCard = {
            parameter_mappings: [
              {
                parameter_id: filterWithDefaultValue.id,
                card_id,
                target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
              },
              {
                parameter_id: filter.id,
                card_id,
                target: ["dimension", ["field", PRODUCTS.ID, null]],
              },
            ],
          };

          cy.editDashboardCard(dashboardCard, mapFiltersToCard);

          cy.intercept(
            "POST",
            `/api/dashboard/${dashboard_id}/dashcard/*/card/${card_id}/query`,
          ).as("cardQuery");

          visitDashboard(dashboard_id);
        },
      );
    });

    describe("as a user with access to underlying data", () => {
      it("should let you click through the title to the query builder with the parameter applied as a filter on the question", () => {
        cy.wait("@cardQuery");

        // make sure query results are correct
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("42");

        // drill through title
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("GUI Question").click();

        // make sure the query builder filter is present
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Category is Doohickey");

        // make sure the results match
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("42");
      });
    });

    describe("as a user without access to underlying data", () => {
      beforeEach(() => {
        cy.signIn("nodata");
        cy.reload();
      });

      it("should let you click through the title to the query builder with the parameter filter showing in the query builder", () => {
        cy.wait("@cardQuery");

        // make sure query results are correct
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("42");

        // drill through title
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("GUI Question").click();

        // make sure the results match
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("42");

        // update the parameter filter to a new value
        filterWidget().contains("Doohickey").click();
        popover().within(() => {
          cy.get("input").type("{backspace}Gadget{enter}");
          cy.findByText("Update filter").click();
        });

        // rerun the query with the newly set filter
        cy.get(".RunButton").first().click();
        cy.wait("@cardQuery");

        // make sure the results reflect the new filter
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("53");

        // make sure the set parameter filter persists after a page refresh
        cy.reload();
        cy.wait("@cardQuery");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("53");

        // make sure the unset id parameter works
        filterWidget().last().click();
        popover().within(() => {
          cy.get("input").type("5{enter}");
          cy.findByText("Add filter").click();
        });

        // rerun the query with the newly set filter
        cy.get(".RunButton").first().click();
        cy.wait("@cardQuery");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("1");
      });
    });
  });
});

function checkFilterLabelAndValue(label, value) {
  filterWidget().find("legend").invoke("text").should("eq", label);
  filterWidget().contains(value);
}

function checkScalarResult(result) {
  cy.get(".ScalarValue").invoke("text").should("eq", result);
}
