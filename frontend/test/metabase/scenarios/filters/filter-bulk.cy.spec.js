import {
  popover,
  restore,
  visitQuestionAdhoc,
  setupBooleanQuery,
  filter,
  filterField,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import { filterFieldPopover } from "../../../__support__/e2e/helpers/e2e-bi-basics-helpers";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

const rawQuestionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
    },
  },
};

const peopleQuestion = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": PEOPLE_ID,
    },
  },
};

const productsQuestion = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": PRODUCTS_ID,
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

  it("should sort database fields by relevance", () => {
    visitQuestionAdhoc(rawQuestionDetails);
    filter();

    modal().within(() => {
      cy.findAllByTestId(/filter-field-/)
        .eq(0)
        .should("include.text", "Created At");

      cy.findAllByTestId(/filter-field-/)
        .eq(1)
        .should("include.text", "Discount");

      cy.findAllByTestId(/filter-field-/)
        .last()
        .should("include.text", "ID");
    });
  });

  it("should add a filter for a raw query", () => {
    visitQuestionAdhoc(rawQuestionDetails);
    filter();

    filterFieldPopover("Quantity", { value: "20" });

    cy.findByLabelText("20").click();
    cy.button("Add filter").click();
    applyFilters();

    cy.findByText("Quantity is equal to 20").should("be.visible");
    cy.findByText("Showing 4 rows").should("be.visible");
  });

  it("should add a filter for an aggregated query", () => {
    visitQuestionAdhoc(aggregatedQuestionDetails);
    filter();

    modal().within(() => {
      cy.findByText("Summaries").click();
    });

    filterField("Count", {
      placeholder: "min",
      value: "500",
    });

    applyFilters();

    cy.findByText("Count is greater than or equal to 500").should("be.visible");
    cy.findByText("Showing 21 rows").should("be.visible");
  });

  it("should add a filter for linked tables", () => {
    visitQuestionAdhoc(rawQuestionDetails);
    filter();

    modal().within(() => {
      cy.findByText("Product").click();

      filterField("Category").findByText("Gadget").click();
    });

    applyFilters();

    cy.findByText("Category is Gadget").should("be.visible");
    cy.findByText("Showing first 2,000 rows").should("be.visible");
  });

  it("should update an existing filter", () => {
    visitQuestionAdhoc(filteredQuestionDetails);
    filter();

    modal().within(() => {
      cy.findByText("30").click();
    });

    popover().within(() => {
      cy.findByRole("textbox").click().type("30").clear().type("25");

      cy.button("Update filter").click();
    });

    applyFilters();

    cy.findByText("Quantity is greater than 20").should("be.visible");
    cy.findByText("Quantity is less than 25").should("be.visible");
    cy.findByText("Showing 17 rows").should("be.visible");
  });

  it("should remove an existing filter", () => {
    visitQuestionAdhoc(filteredQuestionDetails);
    filter();

    modal().within(() => {
      cy.findByText("30")
        .parent()
        .within(() => cy.icon("close").click());
    });
    applyFilters();

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
      filter();

      modal().within(() => {
        filterField("segments").within(() =>
          cy.findByText("Filter segments").click(),
        );
      });

      popover().within(() => {
        cy.findByText(SEGMENT_1_NAME);
        cy.findByText(SEGMENT_2_NAME).click();
      });

      applyFilters();

      cy.findByTestId("qb-filters-panel").findByText(SEGMENT_2_NAME);
      cy.findByText("Showing 1,915 rows");

      filter();

      modal().within(() => {
        filterField("segments").within(() =>
          cy.findByText(SEGMENT_2_NAME).click(),
        );
      });

      popover().within(() => {
        cy.findByText(SEGMENT_2_NAME).click();
      });

      applyFilters();

      cy.findByTestId("qb-filters-panel").should("not.exist");
      cy.findByText("Showing first 2,000 rows");
    });

    it("should load already applied segments", () => {
      const segmentFilterQuestion = {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            filter: ["segment", 1],
          },
        },
      };

      visitQuestionAdhoc(segmentFilterQuestion);
      filter();

      modal().within(() => {
        filterField("segments").within(() => {
          cy.findByText(SEGMENT_1_NAME);
          cy.findByText(SEGMENT_2_NAME).should("not.exist");
        });
      });
    });
  });

  describe("boolean filters", () => {
    beforeEach(() => {
      setupBooleanQuery();
      filter();
    });

    it("should apply a boolean filter", () => {
      modal().within(() => {
        cy.findByText("True").click();
      });
      applyFilters();

      cy.findByText("Showing 2 rows").should("be.visible");
    });

    it("should change a boolean filter", () => {
      modal().within(() => {
        cy.findByText("True").click();
      });
      applyFilters();

      cy.findByText("Showing 2 rows").should("be.visible");

      filter();

      modal().within(() => {
        cy.findByText("False").click();
      });
      applyFilters();

      cy.findByText("Showing 1 row").should("be.visible");
    });

    it("should remove a boolean filter", () => {
      modal().within(() => {
        cy.findByText("True").click();
      });
      applyFilters();

      cy.findByText("Showing 2 rows").should("be.visible");

      filter();

      modal().within(() => {
        cy.findByText("True").click();
      });
      applyFilters();

      cy.findByText("Showing 4 rows").should("be.visible");
    });
  });

  describe("date filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(rawQuestionDetails);
      filter();
    });

    it("can add a date shortcut filter", () => {
      modal().within(() => {
        cy.findByText("Today").click();
      });
      applyFilters();

      cy.findByText("Created At Today").should("be.visible");
      cy.findByText("Showing 0 rows").should("be.visible");
    });

    it("can add a date shortcut filter from the popover", () => {
      filterField("Created At").findByLabelText("more options").click();

      cy.findByText("Last 3 Months").click();

      modal().within(() => {
        cy.findByText("Previous 3 Months");
      });
      applyFilters();

      cy.findByText("Created At Previous 3 Months").should("be.visible");
      cy.findByText("Showing 0 rows").should("be.visible");
    });

    // if this gets flaky, disable, it's an issue with internal state in the datepicker component
    it.skip("can add a date range filter", () => {
      modal().within(() => {
        cy.findByLabelText("Created At").within(() => {
          cy.findByLabelText("more options").click();
        });
      });
      cy.findByText("Specific dates...").click();
      cy.findByText("Before").click();

      popover().within(() => {
        cy.get("input").eq(0).clear().type("01/01/2017", { delay: 0 });

        cy.findByText("Add filter").click();
      });

      modal().within(() => {
        cy.findByLabelText("Created At").within(() => {
          cy.findByText("is before January 1, 2017").should("be.visible");
        });
      });
      applyFilters();

      cy.findByText("Created At is before January 1, 2017").should(
        "be.visible",
      );
      cy.findByText("Showing 744 rows").should("be.visible");
    });

    it("Can cancel adding date filter", () => {
      filterField("Created At").findByLabelText("more options").click();

      cy.findByText("Discount").click();

      filterField("Created At").within(() => {
        // there should be no filter so the X should not populate
        cy.get(".Icon-close").should("not.exist");
      });
    });
  });

  describe("category filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(peopleQuestion);
      filter();
    });

    it("should show inline category picker for referral source", () => {
      modal().within(() => {
        cy.findByText("Affiliate").click();
      });
      applyFilters();

      cy.findByText("Source is Affiliate").should("be.visible");
      cy.findByText("Showing 506 rows").should("be.visible");
    });

    it("should not show inline category picker for state", () => {
      modal().within(() => {
        cy.findByLabelText("State").click();
      });

      popover().within(() => {
        cy.findByText("AZ").click();
        cy.button("Add filter").click();
      });

      applyFilters();

      cy.findByText("State is AZ").should("be.visible");
      cy.findByText("Showing 20 rows").should("be.visible");
    });
  });

  describe("key filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(rawQuestionDetails);
      filter();
    });

    it("filters by primary keys", () => {
      filterField("ID", {
        value: "17, 18",
      });

      applyFilters();

      cy.findByText("Showing 2 rows").should("be.visible");
      cy.findByText("131.68").should("be.visible"); // total for order id 17
      cy.findByText("123.99").should("be.visible"); // total for order id 18
    });

    it("filters by a foreign key", () => {
      filterField("Product ID", {
        value: "65",
      });

      applyFilters();

      cy.findByText("Showing 107 rows").should("be.visible");
    });
  });

  describe("text filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(peopleQuestion);
      filter();
    });

    it("adds a contains text filter", () => {
      filterField("City", {
        value: "Indian",
      });

      applyFilters();

      cy.findByText("Showing 5 rows").should("be.visible");
    });

    it("adds an ends with text filter", () => {
      filterField("City", {
        operator: "ends with",
        value: "Valley",
      });

      applyFilters();

      cy.findByText("Showing 8 rows").should("be.visible");
    });

    it("adds multiple is text filters", () => {
      filterField("City", {
        operator: "is",
        value: "Indianeown, Indian Valley",
      });

      applyFilters();

      cy.findByText("City is 2 selections").should("be.visible");
      cy.findByText("Showing 1 row").should("be.visible");
    });
  });

  describe("number filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(productsQuestion);
      filter();
    });

    it("applies a between filter", () => {
      filterField("Price", {
        placeholder: "min",
        value: "50",
      });

      filterField("Price", {
        placeholder: "max",
        value: "80",
      });

      applyFilters();

      cy.findByText("Price between 50 80").should("be.visible");
      cy.findByText("Showing 72 rows").should("be.visible");
    });

    it("applies a greater than filter", () => {
      filterField("Price", {
        operator: "greater than",
        value: "50",
      });

      applyFilters();

      cy.findByText("Price is greater than 50").should("be.visible");
      cy.findByText("Showing 106 rows").should("be.visible");
    });

    it("infers a <= filter from an invalid between filter", () => {
      filterField("Price", {
        placeholder: "max",
        value: "50",
      });

      applyFilters();

      cy.findByText("Price is less than or equal to 50").should("be.visible");
      cy.findByText("Showing 94 rows").should("be.visible");
    });
  });

  describe("column search", () => {
    beforeEach(() => {
      visitQuestionAdhoc(productsQuestion);
      filter();
      cy.get("body").type(`{ctrl}k`);
    });

    it("can search for a column", () => {
      modal().within(() => {
        cy.findByText("In").should("not.exist");
        cy.findByText("Category").should("be.visible");

        cy.findByPlaceholderText("Search for a column...").clear().type("vend");

        cy.findByText("Category").should("not.exist");

        filterField("Vendor")
          .findByText("in") // "In Products"
          .should("be.visible");

        filterField("Vendor").findByText("Vendor").should("be.visible");
      });
    });

    it("can apply a filter from a searched column", () => {
      modal().within(() => {
        cy.findByPlaceholderText("Search for a column...")
          .clear()
          .type("price");

        // need to block until filter is applied
        cy.findByText("Category").should("not.exist");
      });

      filterField("Price", {
        operator: "greater than",
        value: "90",
      });

      applyFilters();

      cy.findByText("Price is greater than 90").should("be.visible");
      cy.findByText("Showing 10 rows").should("be.visible");
    });
  });
});

const modal = () => {
  return cy.get(".Modal");
};

const applyFilters = () => {
  modal().within(() => {
    cy.findByTestId("apply-filters").click();
  });

  cy.wait("@dataset");
};
