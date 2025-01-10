import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > dashboard > title drill", () => {
  describe("on a native question without connected dashboard parameters", () => {
    beforeEach(() => {
      H.restore();
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
        ({ body: { dashboard_id }, questionId }) => {
          cy.wrap(questionId).as("questionId");
          H.visitDashboard(dashboard_id);
        },
      );
    });

    describe("as a user with access to underlying data", () => {
      it("should let you click through the title to the query builder (metabase#13042)", () => {
        cy.get("@questionId").then(questionId => {
          cy.findByTestId("loading-indicator").should("not.exist");

          H.getDashboardCard().findByRole("link", { name: "Q1" }).as("title");
          cy.get("@title").realHover();
          cy.get("@title")
            .should("have.attr", "href")
            .and("include", `/question/${questionId}`);
          cy.get("@title").click();

          H.queryBuilderMain().within(() => {
            cy.findByText("This question is written in SQL.").should(
              "be.visible",
            );
            cy.findByText("foo").should("be.visible");
            cy.findByText("bar").should("be.visible");
          });

          cy.location("pathname").should("eq", `/question/${questionId}-q1`);
        });
      });
    });

    describe("as a user without access to the underlying data", () => {
      beforeEach(() => {
        cy.signIn("nodata");
        cy.reload();
      });

      it("should let you click through the title to the query builder (metabase#13042)", () => {
        cy.get("@questionId").then(questionId => {
          cy.findByTestId("loading-indicator").should("not.exist");

          H.getDashboardCard().findByRole("link", { name: "Q1" }).as("title");
          cy.get("@title").realHover();
          cy.get("@title")
            .should("have.attr", "href")
            .and("include", `/question/${questionId}`);
          cy.get("@title").click();

          H.queryBuilderMain().within(() => {
            cy.findByText("This question is written in SQL.").should(
              "be.visible",
            );
            cy.findByText("foo").should("be.visible");
            cy.findByText("bar").should("be.visible");
          });

          cy.location("pathname").should("eq", `/question/${questionId}-q1`);
        });
      });
    });
  });

  describe("on a native question with a connected dashboard parameter", () => {
    beforeEach(() => {
      H.restore();
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
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
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

        H.visitDashboard(dashboard_id);
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
      H.restore();
      cy.signInAsAdmin();

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashboardCard, questionId }) => {
          const { card_id, dashboard_id } = dashboardCard;

          cy.wrap(questionId).as("questionId");

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

          H.visitDashboard(dashboard_id);
        },
      );
    });

    describe("as a user with access to underlying data", () => {
      it("should let you click through the title to the query builder with the parameter applied as a filter on the question", () => {
        cy.wait("@cardQuery");

        // make sure query results are correct
        H.getDashboardCard().findByText("42");

        H.getDashboardCard()
          .findByRole("link", { name: "GUI Question" })
          .as("title");
        cy.get("@title").realHover();
        cy.get("@title")
          .should("have.attr", "href")
          .and("include", "/question#");
        cy.get("@title").click();

        // make sure the query builder filter is present
        cy.findByTestId("qb-filters-panel")
          .findByText("Category is Doohickey")
          .should("be.visible");

        // make sure the results match
        H.queryBuilderMain().findByText("42").should("be.visible");
        cy.location("href").should("include", "/question#");
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
        H.getDashboardCard().findByText("42").should("be.visible");

        H.getDashboardCard()
          .findByRole("link", { name: "GUI Question" })
          .as("title");
        cy.get("@title").realHover();
        cy.get("@title")
          .should("have.attr", "href")
          .and("include", "/question?category=Doohickey&id=#");
        cy.get("@title").click();

        // make sure the results match
        H.queryBuilderMain().findByText("42").should("be.visible");
        cy.get("@questionId").then(questionId => {
          cy.location("href").should(
            "include",
            `/question/${questionId}-gui-question?category=Doohickey&id=#`,
          );
        });

        // update the parameter filter to a new value
        H.filterWidget().contains("Doohickey").click();
        H.popover().within(() => {
          H.fieldValuesInput().type("{backspace}Gadget,");
          cy.findByText("Update filter").click();
        });

        // rerun the query with the newly set filter
        cy.findAllByTestId("run-button").first().click();
        cy.wait("@cardQuery");

        // make sure the results reflect the new filter
        H.queryBuilderMain().findByText("53").should("be.visible");

        // make sure the set parameter filter persists after a page refresh
        cy.reload();
        cy.wait("@cardQuery");

        H.queryBuilderMain().findByText("53").should("be.visible");

        // make sure the unset id parameter works
        H.filterWidget().last().click();
        H.popover().within(() => {
          H.fieldValuesInput().type("5");
          cy.findByText("Add filter").click();
        });

        // rerun the query with the newly set filter
        cy.findAllByTestId("run-button").first().click();
        cy.wait("@cardQuery");

        H.queryBuilderMain().findByText("1").should("be.visible");
      });
    });
  });

  describe("on a nested simple question with a connected dashboard parameter", () => {
    const questionDetails = {
      name: "GUI Question",
      query: {
        "source-table": PRODUCTS_ID,
      },
    };
    const baseNestedQuestionDetails = {
      name: "Nested GUI Question",
    };

    const idFilter = { name: "ID", slug: "id", id: "f2bf003c", type: "id" };

    const dashboardDetails = {
      name: "Nested question dashboard",
      parameters: [idFilter],
    };

    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      cy.createQuestion(questionDetails, {
        wrapId: true,
        idAlias: "questionId",
      });

      cy.get("@questionId").then(questionId => {
        const nestedQuestionDetails = {
          ...baseNestedQuestionDetails,
          query: {
            "source-table": `card__${questionId}`,
          },
        };
        cy.createQuestion(nestedQuestionDetails, {
          wrapId: true,
          idAlias: "nestedQuestionId",
        });
      });

      cy.createDashboard(dashboardDetails).then(
        ({ body: { id: dashboardId } }) => {
          cy.wrap(dashboardId).as("dashboardId");
        },
      );

      cy.then(function () {
        H.addOrUpdateDashboardCard({
          card_id: this.nestedQuestionId,
          dashboard_id: this.dashboardId,
          card: {
            parameter_mappings: [
              {
                parameter_id: idFilter.id,
                card_id: this.nestedQuestionId,
                target: ["dimension", ["field", PRODUCTS.ID, null]],
              },
            ],
          },
        });
      });
    });

    it("should lead you to a table question with filtered ID (metabase#17213)", () => {
      const productRecordId = 3;
      H.visitDashboard("@dashboardId", { params: { id: productRecordId } });

      H.getDashboardCard()
        .findByRole("link", { name: baseNestedQuestionDetails.name })
        .as("title");
      cy.get("@title").realHover();
      cy.get("@title").should("have.attr", "href").and("include", "/question#");
      cy.get("@title").click();

      H.appBar()
        .contains(`Started from ${baseNestedQuestionDetails.name}`)
        .should("be.visible");
      cy.findByTestId("question-row-count")
        .findByText("Showing 1 row")
        .should("be.visible");

      cy.findByTestId("object-detail").should("not.exist");
      cy.location("href").should("include", "/question#");
    });
  });

  describe("on various charts", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("titles become actual HTML anchors on focus and on hover", () => {
      cy.createDashboardWithQuestions({
        dashboardName: "Dashboard with aggregated Q2",
        questions: [
          {
            name: "Line chart",
            display: "line",
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
              ],
              limit: 5,
            },
          },
          {
            name: "Row chart",
            display: "row",
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
              ],
              limit: 5,
            },
          },
          {
            name: "Map chart",
            display: "map",
            query: {
              "source-table": PEOPLE_ID,
              limit: 5,
            },
          },
          {
            name: "Funnel chart",
            display: "funnel",
            query: {
              "source-table": PEOPLE_ID,
              aggregation: [["count"]],
              breakout: [["field", PEOPLE.SOURCE]],
              limit: 5,
            },
          },
        ],
        cards: [
          { row: 0, col: 0, size_x: 6, size_y: 6 },
          { row: 0, col: 6, size_x: 6, size_y: 6 },
          { row: 6, col: 0, size_x: 6, size_y: 6 },
          { row: 6, col: 6, size_x: 6, size_y: 6 },
        ],
      }).then(({ dashboard, questions }) => {
        H.visitDashboard(dashboard.id);

        // make cursor start from a place where subsequent realHover() calls
        // won't make the cursor move over the other cards during test
        // (which would interfere with assertions)
        cy.findByTestId("sidebar-toggle").realHover();

        H.getDashboardCard(0)
          .findByRole("link", { name: "Line chart" })
          .as("line-chart-title");
        H.getDashboardCard(1)
          .findByRole("link", { name: "Row chart" })
          .as("row-chart-title");
        H.getDashboardCard(2)
          .findByRole("link", { name: "Map chart" })
          .as("map-chart-title");
        H.getDashboardCard(3)
          .findByRole("link", { name: "Funnel chart" })
          .as("funnel-chart-title");

        assertTitleHrefOnFocus({
          elementAlias: "@line-chart-title",
          href: `/question/${questions[0].id}-line-chart`,
        });
        assertTitleHrefOnFocus({
          elementAlias: "@row-chart-title",
          href: `/question/${questions[1].id}-row-chart`,
        });
        assertTitleHrefOnHover({
          elementAlias: "@map-chart-title",
          href: `/question/${questions[2].id}-map-chart`,
        });
        assertTitleHrefOnHover({
          elementAlias: "@funnel-chart-title",
          href: `/question/${questions[3].id}-funnel-chart`,
        });
      });
    });

    function assertTitleHrefOnFocus({ elementAlias, href }) {
      cy.get(elementAlias).should("have.attr", "href", "#");
      cy.get(elementAlias).focus();
      cy.get(elementAlias).should("have.attr", "href", href);
    }

    function assertTitleHrefOnHover({ elementAlias, href }) {
      cy.get(elementAlias).should("have.attr", "href", "#");
      cy.get(elementAlias).realHover();
      cy.get(elementAlias).should("have.attr", "href", href);
    }
  });
});

function checkFilterLabelAndValue(label, value) {
  H.filterWidget().find("legend").invoke("text").should("eq", label);
  H.filterWidget().contains(value);
}

function checkScalarResult(result) {
  cy.findByTestId("scalar-value").invoke("text").should("eq", result);
}
