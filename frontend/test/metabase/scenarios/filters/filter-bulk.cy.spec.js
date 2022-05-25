import {
  popover,
  restore,
  visitQuestionAdhoc,
  filter,
} from "__support__/e2e/cypress";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const rawQuestionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
    },
  },
};

const filteredQuestionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      filter: [
        "and",
        [">", ["field", ORDERS.QUANTITY, null], 20],
        ["<", ["field", ORDERS.QUANTITY, null], 30],
      ],
    },
  },
};

const aggregatedQuestionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      aggregation: [["count"]],
    },
  },
};

const openFilterModal = () => {
  cy.findByLabelText("Show more filters").click();
};

describe("scenarios > filters > bulk filtering", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add a filter for a raw query", () => {
    visitQuestionAdhoc(rawQuestionDetails);
    openFilterModal();

    modal().within(() => {
      cy.findByLabelText("Quantity").click();
    });

    popover().within(() => {
      cy.findByPlaceholderText("Search the list").type("21");
      cy.findByText("20").click();
      cy.button("Add filter").click();
    });

    modal().within(() => {
      cy.button("Apply").click();
      cy.wait("@dataset");
    });

    cy.findByText("Quantity is equal to 20").should("be.visible");
    cy.findByText("Showing 4 rows").should("be.visible");
  });

  it("should add a filter for an aggregated query", () => {
    visitQuestionAdhoc(aggregatedQuestionDetails);
    openFilterModal();

    modal().within(() => {
      cy.findByLabelText("Count").click();
    });

    popover().within(() => {
      cy.findByText("Equal to").click();
    });

    popover()
      .eq(1)
      .within(() => cy.findByText("Greater than").click());

    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("500");
      cy.button("Add filter").click();
    });

    modal().within(() => {
      cy.button("Apply").click();
      cy.wait("@dataset");
    });

    cy.findByText("Count is greater than 500").should("be.visible");
    cy.findByText("Showing 21 rows").should("be.visible");
  });

  it("should add a filter for linked tables", () => {
    visitQuestionAdhoc(rawQuestionDetails);
    openFilterModal();

    modal().within(() => {
      cy.findByText("Product").click();
      cy.findByLabelText("Category").click();
    });

    popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    modal().within(() => {
      cy.button("Apply").click();
      cy.wait("@dataset");
    });

    cy.findByText("Category is Gadget").should("be.visible");
    cy.findByText("Showing first 2,000 rows").should("be.visible");
  });

  it("should update an existing filter", () => {
    visitQuestionAdhoc(filteredQuestionDetails);
    openFilterModal();

    modal().within(() => {
      cy.findByText("is less than 30").click();
    });

    popover().within(() => {
      cy.findByRole("textbox")
        .click()
        .type("30")
        .clear()
        .type("25");

      cy.button("Update filter").click();
    });

    modal().within(() => {
      cy.button("Apply").click();
      cy.wait("@dataset");
    });

    cy.findByText("Quantity is greater than 20").should("be.visible");
    cy.findByText("Quantity is less than 25").should("be.visible");
    cy.findByText("Showing 17 rows").should("be.visible");
  });

  it("should remove an existing filter", () => {
    visitQuestionAdhoc(filteredQuestionDetails);
    openFilterModal();

    modal().within(() => {
      cy.findByText("is less than 30")
        .parent()
        .within(() => cy.icon("close").click());

      cy.button("Apply").click();
      cy.wait("@dataset");
    });

    cy.findByText("Quantity is greater than 20").should("be.visible");
    cy.findByText("Quantity is less than 30").should("not.exist");
    cy.findByText("Showing 138 rows").should("be.visible");
  });

  describe("segment filters", () => {
    const SEGMENT_1_NAME = "Orders < 100";
    const SEGMENT_2_NAME = "Discounted Orders";

    beforeEach(() => {
      cy.request("POST", "/api/segment", {
        name: SEGMENT_1_NAME,
        description: "All orders with a total under $100.",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      cy.request("POST", "/api/segment", {
        name: SEGMENT_2_NAME,
        description: "All orders with a discount",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: [">", ["field", ORDERS.DISCOUNT, null], 0],
        },
      });
    });

    it("should apply and remove segment filter", () => {
      visitQuestionAdhoc(rawQuestionDetails);
      openFilterModal();

      modal().within(() => {
        cy.findByText("Segments")
          .parent()
          .within(() => cy.get("button").click());
      });

      popover().within(() => {
        cy.findByText(SEGMENT_1_NAME);
        cy.findByText(SEGMENT_2_NAME).click();
      });

      modal().within(() => {
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByTestId("qb-filters-panel").findByText(SEGMENT_2_NAME);
      cy.findByText("Showing 1,915 rows");

      openFilterModal();

      modal().within(() => {
        cy.findByText("Segments")
          .parent()
          .within(() => cy.get("button").click());
      });

      popover().within(() => {
        cy.findByText(SEGMENT_2_NAME).click();
      });

      modal().within(() => {
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByTestId("qb-filters-panel").should("not.exist");
      cy.findByText("Showing first 2,000 rows");
    });

    it("should load already applied segments", () => {
      visitQuestionAdhoc(rawQuestionDetails);
      filter();
      cy.findByText(SEGMENT_1_NAME).click();

      cy.findByTestId("qb-filters-panel").findByText(SEGMENT_1_NAME);

      openFilterModal();

      modal().within(() => {
        cy.findByText("Segments")
          .parent()
          .within(() => {
            cy.findByText(SEGMENT_1_NAME);
            cy.findByText(SEGMENT_2_NAME).should("not.exist");
          });
      });
    });
  });
});

const modal = () => {
  return cy.get(".Modal");
};
