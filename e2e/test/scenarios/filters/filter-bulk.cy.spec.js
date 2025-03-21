const { H } = cy;
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

  it("should add a filter for a raw query", () => {
    H.visitQuestionAdhoc(rawQuestionDetails);
    H.filter();
    H.popover().within(() => {
      cy.findByText("Quantity").click();
      cy.findByText("20").click();
      cy.button("Add filter").click();
    });
    applyFilters();

    H.queryBuilderFiltersPanel()
      .findByText("Quantity is equal to 20")
      .should("be.visible");
    H.assertQueryBuilderRowCount(4);
  });

  it("should have an info icon on the filter picker filters", () => {
    H.visitQuestionAdhoc(rawQuestionDetails);
    H.filter();
    H.popover().within(() => {
      cy.findByLabelText("Created At").findByLabelText("More info").realHover();
    });

    H.hovercard().within(() => {
      cy.contains("The date and time an order was submitted");
      cy.contains("Creation timestamp");
    });
  });

  it("should add a filter for an aggregated query", () => {
    H.visitQuestionAdhoc(aggregatedQuestionDetails);
    H.filter();
    H.popover().within(() => {
      cy.findByText("Summaries").click();
      cy.findByText("Count").click();
      cy.findByPlaceholderText("Min").type("500");
      cy.button("Add filter").click();
    });
    applyFilters();
    H.queryBuilderFiltersPanel()
      .findByText("Count is greater than or equal to 500")
      .should("be.visible");
    H.assertQueryBuilderRowCount(21);
  });

  it("should add a filter for linked tables", () => {
    H.visitQuestionAdhoc(rawQuestionDetails);
    H.filter();
    H.popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    applyFilters();
    H.queryBuilderFiltersPanel()
      .findByText("Product → Category is Gadget")
      .should("be.visible");
    H.queryBuilderFooter()
      .findByText("Showing first 2,000 rows")
      .should("be.visible");
  });

  it("should update an existing filter", () => {
    H.visitQuestionAdhoc(filteredQuestionDetails);
    H.queryBuilderFiltersPanel().findByText("Quantity is less than 30").click();
    H.popover().within(() => {
      cy.findByLabelText("Filter value").type("{backspace}{backspace}25");
      cy.button("Update filter").click();
    });
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().within(() => {
      cy.findByText("Quantity is greater than 20").should("be.visible");
      cy.findByText("Quantity is less than 25").should("be.visible");
    });
    H.assertQueryBuilderRowCount(17);
  });

  it("should remove an existing filter", () => {
    H.visitQuestionAdhoc(filteredQuestionDetails);
    H.filter();
    H.queryBuilderFiltersPanel()
      .findByText("Quantity is less than 30")
      .icon("close")
      .click();
    cy.wait("@dataset");
    H.queryBuilderFiltersPanel().within(() => {
      cy.findByText("Quantity is greater than 20").should("be.visible");
      cy.findByText("Quantity is less than 30").should("not.exist");
    });
    H.assertQueryBuilderRowCount(138);
  });

  it("should be able to add and remove filters for all query stages", () => {
    H.visitQuestionAdhoc(multiStageQuestionDetails);

    cy.log("add filters for all stages in the filter modal");
    cy.log("stage 0");
    H.filter();
    H.popover().within(() => {
      cy.findByText("Category").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    cy.log("stage 1");
    H.filter();
    H.popover().within(() => {
      cy.findByText("Summaries").click();
      cy.findByText("Category").click();
      cy.findByText("Widget").click();
      cy.button("Add filter").click();
    });
    cy.log("stage 2");
    H.filter();
    H.popover().within(() => {
      cy.findByText("Summaries (2)").click();
      cy.findByText("Category").click();
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });
    cy.log("stage 3");
    H.filter();
    H.popover().within(() => {
      cy.findByText("Summaries (3)").click();
      cy.findByText("Category").click();
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });
    applyFilters();

    cy.log("check filters from all stages to be present in the filter panel");
    H.queryBuilderFiltersPanel().within(() => {
      cy.findByText("Category is Gadget").should("be.visible");
      cy.findByText("Category is Widget").should("be.visible");
      cy.findByText("Category is Gizmo").should("be.visible");
      cy.findByText("Category is Doohickey").should("be.visible");
    });

    cy.log("clear all filters");
    H.queryBuilderFiltersPanel().within(() => {
      cy.findByText("Category is Gadget").icon("close").click();
      cy.wait("@dataset");
      cy.findByText("Category is Widget").icon("close").click();
      cy.wait("@dataset");
      cy.findByText("Category is Gizmo").icon("close").click();
      cy.wait("@dataset");
      cy.findByText("Category is Doohickey").icon("close").click();
      cy.wait("@dataset");
    });
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

    it("should apply and remove segment filter (metabase#50734)", () => {
      H.visitQuestionAdhoc(rawQuestionDetails);
      H.filter();

      // Only the H.modal().within(() => { ... }) block is the repro. The rest is a regular test.
      cy.log(
        "segment filter icon should be aligned with other filter icons (metabase#50734)",
      );
      H.popover().within(() => {
        cy.findByLabelText(SEGMENT_1_NAME)
          .findByRole("img")
          .should("be.visible")
          .then(([$segmentsIcon]) => {
            const segmentsIconRect = $segmentsIcon.getBoundingClientRect();

            cy.findByLabelText("Discount")
              .findByRole("img")
              .should(([$discountIcon]) => {
                const discountIconRect = $discountIcon.getBoundingClientRect();
                expect(segmentsIconRect.left).to.eq(discountIconRect.left);
                expect(segmentsIconRect.right).to.eq(discountIconRect.right);
              });
          });
      });

      H.popover().findByText(SEGMENT_2_NAME).click();
      applyFilters();
      H.queryBuilderFiltersPanel()
        .findByText(SEGMENT_2_NAME)
        .should("be.visible");
      H.assertQueryBuilderRowCount(1915);

      H.queryBuilderFiltersPanel()
        .findByText(SEGMENT_2_NAME)
        .icon("close")
        .click();
      cy.wait("@dataset");
      H.queryBuilderFiltersPanel().should("not.exist");
      H.queryBuilderFooter().findByText("Showing first 2,000 rows");
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

      cy.findByTestId("view-footer").should("contain", "Showing 2 rows");
    });

    it("should change a boolean filter", () => {
      H.modal().within(() => {
        cy.findByText("True").click();
      });
      applyFilters();

      cy.findByTestId("view-footer").should("contain", "Showing 2 rows");

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

      cy.findByTestId("view-footer").should("contain", "Showing 2 rows");

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
      H.modal().findByText("Previous 3 months").should("be.visible");

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

      cy.findByTestId("view-footer").should("contain", "Showing 2 rows");
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
  H.runButtonOverlay().click();
  cy.wait("@dataset");
};
