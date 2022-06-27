import _ from "underscore";
import { restore, describeEE, visitQuestion } from "__support__/e2e/helpers";

describeEE("audit > auditing > questions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("table", () => {
    it("should have default sorting by query runs that can be changed", () => {
      const QUERY_RUNS_DESC_ORDER = [
        "Orders, Count, Grouped by Created At (year)",
        "Orders, Count",
        "Orders",
      ];

      const QUERY_RUNS_ASC_ORDER = [...QUERY_RUNS_DESC_ORDER].reverse();

      _.times(1, () => visitQuestion(1));
      _.times(2, () => visitQuestion(2));
      _.times(3, () => visitQuestion(3));

      cy.visit("/admin/audit/questions/all");

      assertRowsOrder(QUERY_RUNS_DESC_ORDER);

      cy.findByText("Query Runs").click();

      assertRowsOrder(QUERY_RUNS_ASC_ORDER);

      cy.findByText("Query Runs").click();

      assertRowsOrder(QUERY_RUNS_DESC_ORDER);
    });

    it("should support filtering by question name", () => {
      cy.visit("/admin/audit/questions/all");
      cy.findByPlaceholderText("Question name").type("year");

      cy.get("tbody > tr").should("have.length", 1);
      cy.findByText("Orders, Count, Grouped by Created At (year)");
    });

    it("should support filtering by collection name", () => {
      const FIRST_COLLECTION_ID = 9;

      cy.createNativeQuestion({
        name: "My question",
        native: {
          query: "SELECT * FROM ORDERS",
          "template-tags": {},
          collection_id: 1,
        },
        collection_id: FIRST_COLLECTION_ID,
      });

      cy.visit("/admin/audit/questions/all");

      cy.findByPlaceholderText("Collection name").type("First");

      cy.get("tbody > tr").should("have.length", 1);
      cy.findByText("My question");
    });

    it("should display total runtime correctly (metabase#18317)", () => {
      const runtimeIndex = 7;

      cy.visit("/admin/audit/questions/all");

      cy.get("th")
        .eq(runtimeIndex)
        .should("contain", "Total Runtime (ms)");

      cy.get("td")
        .eq(runtimeIndex)
        .should("not.contain", "Link");
    });
  });
});

const assertRowsOrder = names => {
  cy.get("tbody > tr").each((el, index) => {
    const nameColumn = el.find("td").eq(0);
    cy.wrap(nameColumn).should("have.text", names[index]);
  });
};
