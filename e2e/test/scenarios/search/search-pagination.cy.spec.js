import _ from "underscore";

const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const PAGE_SIZE = 50;
const TOTAL_ITEMS = PAGE_SIZE + 1;

describe("scenarios > search", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not search on an empty string", () => {
    cy.intercept("GET", "/api/search?q=*").as("search");
    H.visitFullAppEmbeddingUrl({
      url: "/",
      qs: { top_nav: true, search: true },
    });

    H.getSearchBar().type(" ").should("have.value", " ");
    cy.findByTestId("search-results-floating-container")
      .findByText("Recently viewed")
      .should("be.visible");

    H.getSearchBar().clear().type("ord");
    cy.wait("@search");
    cy.findByTestId("search-bar-results-container").should("be.visible");

    H.getSearchBar().clear().type(" ").should("have.value", " ");
    cy.findByTestId("search-results-floating-container")
      .findByText("Recently viewed")
      .should("be.visible");
    cy.findByTestId("search-bar-results-container").should("not.exist");
    cy.get("@search.all").should("have.length", 1);
  });

  describe("multiple pages of results", () => {
    before(() => {
      cy.signInAsAdmin();
      H.restore();
      generateQuestions(TOTAL_ITEMS);
      H.snapshot("many-questions");
    });

    beforeEach(() => {
      H.restore("many-questions");
    });

    it("should allow users to paginate results", () => {
      cy.visit("/");
      H.commandPaletteSearch("generated_question");
      cy.findByLabelText("Previous page").should("be.disabled");

      // First page
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("search-result-item").should("have.length", PAGE_SIZE);

      cy.findByLabelText("Next page").click();

      // Second page
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${PAGE_SIZE + 1} - ${TOTAL_ITEMS}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("search-result-item").should("have.length", 1);
      cy.findByLabelText("Next page").should("be.disabled");

      cy.findByLabelText("Previous page").click();

      // First page
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("search-result-item").should("have.length", PAGE_SIZE);
    });

    it("should reset the page when filters change (metabase#65501)", () => {
      cy.visit("/search?q=");
      cy.findByLabelText("Next page").click();
      cy.location("search").should("include", "page=1");
      cy.findByLabelText("Previous page").should("be.enabled");

      cy.findByTestId("type-search-filter").click();
      H.popover().findByText("Table").click();
      H.popover().findByText("Apply").click();

      cy.location("search")
        .should("include", "type=table")
        .and("not.include", "page=");
      cy.findAllByTestId("search-result-item").should(($items) => {
        $items.each((_index, item) => {
          expect(item).to.have.attr("data-model-type", "table");
        });
      });
    });
  });
});

const generateQuestions = (count) => {
  _.range(count).map((i) =>
    H.createQuestion({
      name: `generated_question ${i}`,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
        ],
      },
    }),
  );
};
