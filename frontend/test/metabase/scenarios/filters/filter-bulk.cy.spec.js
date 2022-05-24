import { popover, restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
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

describe("scenarios > filters > bulk filtering", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add a filter for a raw query", () => {
    visitQuestionAdhoc(rawQuestionDetails);
    cy.findByLabelText("Show more filters").click();

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
    cy.findByLabelText("Show more filters").click();

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
    cy.findByLabelText("Show more filters").click();

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
    cy.findByLabelText("Show more filters").click();

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
    cy.findByLabelText("Show more filters").click();

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
});

const modal = () => {
  return cy.get(".Modal");
};
