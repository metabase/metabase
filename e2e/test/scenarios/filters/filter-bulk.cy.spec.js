import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

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

const multiStageQuestionDetails = {
  name: "Test question",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-query": {
        "source-query": {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
  },
};

describe("scenarios > filters > bulk filtering", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should sort database fields by relevance", () => {
    H.visitQuestionAdhoc(rawQuestionDetails);
    H.filter();

    H.modal().within(() => {
      cy.findAllByTestId(/filter-column-/)
        .eq(0)
        .should("include.text", "Created At");

      cy.findAllByTestId(/filter-column-/)
        .eq(1)
        .should("include.text", "Discount");

      cy.findAllByTestId(/filter-column-/)
        .last()
        .should("include.text", "ID");
    });
  });

  it("should add a filter for a raw query", () => {
    H.visitQuestionAdhoc(rawQuestionDetails);
    H.filter();

    H.filterField("Quantity", { operator: "equal to" });
    H.filterFieldPopover("Quantity").within(() => {
      cy.findByText("20").click();
    });

    applyFilters();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is equal to 20").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 4 rows").should("be.visible");
  });

  it("should have an info icon on the filter modal filters", () => {
    H.visitQuestionAdhoc(rawQuestionDetails);
    H.filter();

    H.modal().within(() => {
      cy.get("li").findByLabelText("More info").realHover();
    });

    H.hovercard().within(() => {
      cy.contains("The date and time an order was submitted");
      cy.contains("Creation timestamp");
    });
  });

  it("should add a filter for an aggregated query", () => {
    H.visitQuestionAdhoc(aggregatedQuestionDetails);
    H.filter();

    H.modal().within(() => {
      cy.findByText("Summaries").click();
    });

    H.filterField("Count", {
      placeholder: "Min",
      value: "500",
    });

    applyFilters();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count is greater than or equal to 500").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 21 rows").should("be.visible");
  });

  it("should add a filter for linked tables", () => {
    H.visitQuestionAdhoc(rawQuestionDetails);
    H.filter();

    H.modal().within(() => {
      cy.findByText("Product").click({ force: true });
      H.filterField("Category").findByText("Gadget").click();
    });

    applyFilters();

    cy.findByTestId("qb-filters-panel")
      .findByText("Product → Category is Gadget")
      .should("be.visible");

    cy.findByTestId("view-footer")
      .findByText("Showing first 2,000 rows")
      .should("be.visible");
  });

  it("should update an existing filter", () => {
    H.visitQuestionAdhoc(filteredQuestionDetails);
    H.filter();

    H.filterField("Quantity", { order: 1, value: "{backspace}{backspace}25" });

    applyFilters();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is greater than 20").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is less than 25").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 17 rows").should("be.visible");
  });

  it("should remove an existing filter", () => {
    H.visitQuestionAdhoc(filteredQuestionDetails);
    H.filter();

    H.filterField("Quantity", { order: 1, value: "{backspace}{backspace}" });

    applyFilters();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is greater than 20").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quantity is less than 30").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 138 rows").should("be.visible");
  });

  it("should be able to add and remove filters for all query stages", () => {
    H.visitQuestionAdhoc(multiStageQuestionDetails);

    cy.log("add filters for all stages in the filter modal");
    H.filter();
    H.modal().within(() => {
      cy.log("stage 0");
      cy.findByText("Products").click();
      cy.findByLabelText("Gadget").click();

      cy.log("stage 1");
      cy.findByText("Summaries").click();
      cy.findByLabelText("Widget").click();

      cy.log("stage 2");
      cy.findByText("Summaries (2)").click();
      cy.findByLabelText("Gizmo").click();

      cy.log("stage 3");
      cy.findByText("Summaries (3)").click();
      cy.findByLabelText("Doohickey").click();
    });
    applyFilters();

    cy.log("check filters from all stages to be present in the filter panel");
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Category is Gadget").should("be.visible");
      cy.findByText("Category is Widget").should("be.visible");
      cy.findByText("Category is Gizmo").should("be.visible");
      cy.findByText("Category is Doohickey").should("be.visible");
    });

    cy.log("check filters from all stages to be present in the filter modal");
    H.filter();
    H.modal().within(() => {
      cy.log("stage 0");
      cy.findByText("Products").click();
      cy.findByLabelText("Gadget").should("be.checked");
      cy.findByLabelText("Widget").should("not.be.checked");

      cy.log("stage 1");
      cy.findByText("Summaries").click();
      cy.findByLabelText("Widget").should("be.checked");
      cy.findByLabelText("Gizmo").should("not.be.checked");

      cy.log("stage 2");
      cy.findByText("Summaries (2)").click();
      cy.findByLabelText("Gizmo").should("be.checked");
      cy.findByLabelText("Doohickey").should("not.be.checked");

      cy.log("stage 3");
      cy.findByText("Summaries (3)").click();
      cy.findByLabelText("Doohickey").should("be.checked");
      cy.findByLabelText("Gadget").should("not.be.checked");
    });

    cy.log("clear all filters");
    H.modal().button("Clear all filters").click();
    applyFilters();
    cy.findByTestId("qb-filters-panel").should("not.exist");
  });

  describe("segment filters", () => {
    const SEGMENT_1_NAME = "Orders < 100";
    const SEGMENT_2_NAME = "Discounted Orders";

    beforeEach(() => {
      H.createSegment({
        name: SEGMENT_1_NAME,
        description: "All orders with a total under $100.",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      H.createSegment({
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
      H.visitQuestionAdhoc(rawQuestionDetails);
      H.filter();

      H.modal().within(() => {
        H.filterField("segments").within(() =>
          cy.findByPlaceholderText("Filter segments").click(),
        );
      });

      H.popover().within(() => {
        cy.findByText(SEGMENT_1_NAME);
        cy.findByText(SEGMENT_2_NAME).click();
      });

      applyFilters();

      cy.findByTestId("qb-filters-panel").findByText(SEGMENT_2_NAME);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 1,915 rows");

      H.filter();

      H.modal().within(() => {
        H.filterField("segments").within(() =>
          cy.findByText(SEGMENT_2_NAME).next().click(),
        );
      });

      applyFilters();

      cy.findByTestId("qb-filters-panel").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

      H.visitQuestionAdhoc(segmentFilterQuestion);
      H.filter();

      H.modal().within(() => {
        H.filterField("segments").within(() => {
          cy.findByText(SEGMENT_1_NAME);
          cy.findByText(SEGMENT_2_NAME).should("not.exist");
        });
      });
    });
  });

  describe("boolean filters", () => {
    beforeEach(() => {
      H.setupBooleanQuery();
      H.filter();
    });

    it("should apply a boolean filter", () => {
      H.modal().within(() => {
        cy.findByText("True").click();
      });
      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 2 rows").should("be.visible");
    });

    it("should change a boolean filter", () => {
      H.modal().within(() => {
        cy.findByText("True").click();
      });
      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 2 rows").should("be.visible");

      H.filter();

      H.modal().within(() => {
        cy.findByText("False").click();
      });
      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 1 row").should("be.visible");
    });

    it("should remove a boolean filter", () => {
      H.modal().within(() => {
        cy.findByText("True").click();
      });
      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 2 rows").should("be.visible");

      H.filter();

      H.modal().within(() => {
        cy.findByText("True").click();
      });
      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 4 rows").should("be.visible");
    });
  });

  describe("date filters", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc(rawQuestionDetails);
      H.filter();
    });

    it("can add a date shortcut filter", () => {
      H.modal().findByText("Today").click();
      applyFilters();

      cy.findByTestId("qb-filters-panel")
        .findByText("Created At is today")
        .should("be.visible");
    });

    it("can add a date shortcut filter from the popover", () => {
      H.filterField("Created At").findByLabelText("More options").click();
      H.popover()
        .contains("Previous 3 months")
        .findByText("Previous 3 months")
        .click();
      H.modal().findByText("Previous 3 Months").should("be.visible");

      applyFilters();

      cy.findByTestId("qb-filters-panel")
        .findByText("Created At is in the previous 3 months")
        .should("be.visible");
    });

    // if this gets flaky, disable, it's an issue with internal state in the datepicker component
    it.skip("can add a date range filter", () => {
      H.modal().within(() => {
        cy.findByLabelText("Created At").within(() => {
          cy.findByLabelText("More options").click();
        });
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Specific dates…").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Before").click();

      H.popover().within(() => {
        cy.get("input").eq(0).clear().type("01/01/2023", { delay: 0 });

        cy.findByText("Add filter").click();
      });

      H.modal().within(() => {
        cy.findByLabelText("Created At").within(() => {
          cy.findByText("is before January 1, 2023").should("be.visible");
        });
      });
      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Created At is before January 1, 2023").should(
        "be.visible",
      );
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 744 rows").should("be.visible");
    });

    it("Can cancel adding date filter", () => {
      H.filterField("Created At").findByLabelText("More options").click();

      H.filterField("Created At").click({ position: "topRight", force: true });

      H.filterField("Created At").within(() => {
        // there should be no filter so the X should not populate
        cy.get(".Icon-close").should("not.exist");
      });
    });
  });

  describe("category filters", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc(peopleQuestion);
      H.filter();
    });

    it("should show inline category picker for referral source", () => {
      H.modal().within(() => {
        cy.findByText("Affiliate").click();
      });
      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Source is Affiliate").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 506 rows").should("be.visible");
    });

    it("should show value picker for state", () => {
      H.filterFieldPopover("State").within(() => {
        cy.findByText("AZ").click();
      });
      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("State is AZ").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 20 rows").should("be.visible");
    });
  });

  describe("key filters", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc(rawQuestionDetails);
      H.filter();
    });

    it("filters by primary keys", () => {
      H.filterField("ID", {
        value: ["17", "18"],
      });

      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 2 rows").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("131.68").should("be.visible"); // total for order id 17
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("123.99").should("be.visible"); // total for order id 18
    });

    it("filters by a foreign key", () => {
      H.filterField("Product ID", {
        value: "65",
      });

      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 107 rows").should("be.visible");
    });
  });

  describe("text filters", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc(peopleQuestion);
      H.filter();
    });

    it("adds a contains text filter", () => {
      H.filterField("City", {
        operator: "contains",
        value: "Indian",
      });

      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 5 rows").should("be.visible");
    });

    it("adds an ends with text filter", () => {
      H.filterField("City", {
        operator: "ends with",
        value: "Valley",
      });

      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 8 rows").should("be.visible");
    });

    it("adds multiple is text filters", () => {
      H.filterSelectField("City", {
        operator: "is",
        value: ["Indiantown", "Indian Valley"],
      });

      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("City is 2 selections").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 3 rows").should("be.visible");
    });
  });

  describe("number filters", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc(productsQuestion);
      H.filter();
    });

    it("applies a between filter", () => {
      H.filterField("Price", {
        placeholder: "Min",
        value: "50",
      });

      H.filterField("Price", {
        placeholder: "Max",
        value: "80",
      });

      applyFilters();

      cy.findByTestId("qb-filters-panel")
        .findByText("Price is between 50 and 80")
        .should("be.visible");

      H.assertQueryBuilderRowCount(72);
    });

    it("applies a greater than filter", () => {
      H.filterField("Price", {
        operator: "greater than",
        value: "50",
      });

      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Price is greater than 50").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 106 rows").should("be.visible");
    });

    it("infers a <= filter from an invalid between filter", () => {
      H.filterField("Price", {
        placeholder: "Max",
        value: "50",
      });

      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Price is less than or equal to 50").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 94 rows").should("be.visible");
    });
  });

  describe("column search", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc(productsQuestion);
      H.filter();
    });

    it("can search for a column", () => {
      H.modal().within(() => {
        cy.findByText("In").should("not.exist");
        cy.findByText("Category").should("be.visible");

        cy.findByPlaceholderText("Search for a column…").clear().type("vend");

        cy.findByText("Category").should("not.exist");

        H.filterField("Vendor")
          .findByText("in") // "In Products"
          .should("be.visible");

        H.filterField("Vendor").findByText("Vendor").should("be.visible");
      });
    });

    it("can apply a filter from a searched column", () => {
      H.modal().within(() => {
        cy.findByPlaceholderText("Search for a column…").clear().type("price");

        // need to block until filter is applied
        cy.findByText("Category").should("not.exist");
      });

      H.filterField("Price", {
        operator: "greater than",
        value: "90",
      });

      applyFilters();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Price is greater than 90").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Showing 10 rows").should("be.visible");
    });
  });
});

const applyFilters = () => {
  H.modal().findByTestId("apply-filters").click();
  cy.wait("@dataset");
};
