import {
  popover,
  restore,
  visitQuestionAdhoc,
  setupBooleanQuery,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

const openFilterModal = () => {
  cy.findByLabelText("Show more filters").click();
};

describe("scenarios > filters > bulk filtering", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should sort database fields by relevance", () => {
    visitQuestionAdhoc(rawQuestionDetails);
    openFilterModal();

    modal().within(() => {
      cy.findAllByTestId("dimension-filter-label")
        .eq(0)
        .should("have.text", "Created At");

      cy.findAllByTestId("dimension-filter-label")
        .eq(1)
        .should("have.text", "Discount");

      cy.findAllByTestId("dimension-filter-label")
        .last()
        .should("include.text", "ID");
    });
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
      cy.findByText("Summaries").click();

      cy.findByPlaceholderText("min").type("500");

      cy.button("Apply").click();
      cy.wait("@dataset");
    });

    cy.findByText("Count is greater than or equal to 500").should("be.visible");
    cy.findByText("Showing 21 rows").should("be.visible");
  });

  it("should add a filter for linked tables", () => {
    visitQuestionAdhoc(rawQuestionDetails);
    openFilterModal();

    modal().within(() => {
      cy.findByText("Product").click();
      cy.findByLabelText("Gadget").click();
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

  describe("boolean filters", () => {
    beforeEach(() => {
      setupBooleanQuery();
      openFilterModal();
    });

    it("should apply a boolean filter", () => {
      modal().within(() => {
        cy.findByText("true").click();
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByText("Showing 2 rows").should("be.visible");
    });

    it("should change a boolean filter", () => {
      modal().within(() => {
        cy.findByText("true").click();
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByText("Showing 2 rows").should("be.visible");

      openFilterModal();

      modal().within(() => {
        cy.findByText("false").click();
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByText("Showing 1 row").should("be.visible");
    });

    it("should remove a boolean filter", () => {
      modal().within(() => {
        cy.findByText("true").click();
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByText("Showing 2 rows").should("be.visible");

      openFilterModal();

      modal().within(() => {
        cy.findByText("true").click();
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByText("Showing 4 rows").should("be.visible");
    });
  });

  describe("date filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(rawQuestionDetails);
      openFilterModal();
    });

    it("can add a date shortcut filter", () => {
      modal().within(() => {
        cy.findByText("Today").click();
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByText("Created At Today").should("be.visible");
      cy.findByText("Showing 0 rows").should("be.visible");
    });

    it("can add a date shortcut filter from the popover", () => {
      modal().within(() => {
        cy.findByLabelText("Created At").within(() => {
          cy.findByLabelText("more options").click();
        });
      });

      cy.findByText("Last 3 Months").click();

      modal().within(() => {
        cy.findByText("Previous 3 Months");
        cy.findByText("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByText("Created At Previous 3 Months").should("be.visible");
      cy.findByText("Showing 0 rows").should("be.visible");
    });

    // if this gets flaky, disable, it's an issue with internal state in the datepicker component
    it("can add a date range filter", () => {
      modal().within(() => {
        cy.findByLabelText("Created At").within(() => {
          cy.findByLabelText("more options").click();
        });
      });
      cy.findByText("Specific dates...").click();
      cy.findByText("Before").click();

      popover().within(() => {
        cy.get("input")
          .eq(0)
          .clear()
          .type("01/01/2017", { delay: 0 });

        cy.findByText("Add filter").click();
      });

      modal().within(() => {
        cy.findByLabelText("Created At").within(() => {
          cy.findByText("is before January 1, 2017").should("be.visible");
        });

        cy.findByText("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByText("Created At is before January 1, 2017").should(
        "be.visible",
      );
      cy.findByText("Showing 744 rows").should("be.visible");
    });

    it.skip("Bug repro: can cancel adding date filter", () => {
      modal().within(() => {
        cy.findByLabelText("Created At").click();
      });
      // click outside the popover
      cy.findByText("Discount").click();

      cy.findByLabelText("Created At").within(() => {
        // there should be no filter so the X should not populate
        cy.get(".Icon-close").should("not.exist");
      });
    });
  });

  describe("category filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(peopleQuestion);
      openFilterModal();
    });

    it("should show inline category picker for referral source", () => {
      modal().within(() => {
        cy.findByText("Affiliate").click();
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

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

      modal().within(() => {
        cy.button("Apply").click();
        cy.wait("@dataset");
      });

      cy.findByText("State is AZ").should("be.visible");
      cy.findByText("Showing 20 rows").should("be.visible");
    });
  });

  describe("key filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(rawQuestionDetails);
      openFilterModal();
    });

    it("filters by primary keys", () => {
      modal().within(() => {
        cy.findByLabelText("ID").within(() => {
          cy.findByPlaceholderText("Enter an ID").type("17, 18");
        });
        cy.button("Apply").click();
      });

      cy.findByText("Showing 2 rows").should("be.visible");
      cy.findByText("131.68").should("be.visible"); // total for order id 17
      cy.findByText("123.99").should("be.visible"); // total for order id 18
    });

    it("filters by a foreign key", () => {
      modal().within(() => {
        cy.findByLabelText("Product ID").within(() => {
          cy.findByPlaceholderText("Enter an ID").type("65");
        });
        cy.button("Apply").click();
      });

      cy.findByText("Showing 107 rows").should("be.visible");
    });
  });

  describe("text filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(productsQuestion);
      openFilterModal();
    });

    it("adds a contains text filter", () => {
      modal().within(() => {
        cy.findByLabelText("Title").within(() => {
          cy.findByPlaceholderText("Search by Title").type("Marble");
        });
        cy.button("Apply").click();
      });
      cy.findByText("Showing 17 rows").should("be.visible");
    });

    it("adds an ends with text filter", () => {
      modal().within(() => {
        cy.findByLabelText("Title").within(() => {
          cy.findByText("Contains").click();
        });
      });

      popover().within(() => {
        cy.findByText("Ends with").click();
      });

      modal().within(() => {
        cy.findByLabelText("Title").within(() => {
          cy.findByPlaceholderText("Search by Title").type("Hat");
        });
        cy.button("Apply").click();
      });
      cy.findByText("Showing 12 rows").should("be.visible");
    });

    it("adds multiple is text filters", () => {
      modal().within(() => {
        cy.findByLabelText("Title").within(() => {
          cy.findByText("Contains").click();
        });
      });

      popover().within(() => {
        cy.findByText("Is").click();
      });

      modal().within(() => {
        cy.findByLabelText("Title").within(() => {
          cy.findByPlaceholderText("Search by Title").type(
            "Small Marble Shoes,Rustic Paper Wallet",
          );
        });
        cy.button("Apply").click();
      });
      cy.findByText("Title is 2 selections").should("be.visible");
      cy.findByText("Showing 2 rows").should("be.visible");
    });
  });

  describe("number filters", () => {
    beforeEach(() => {
      visitQuestionAdhoc(productsQuestion);
      openFilterModal();
    });

    it("applies a between filter", () => {
      modal().within(() => {
        cy.findByLabelText("Price").within(() => {
          cy.findByPlaceholderText("min").type("50");
          cy.findByPlaceholderText("max").type("80");
        });
        cy.button("Apply").click();
      });
      cy.findByText("Price between 50 80").should("be.visible");
      cy.findByText("Showing 72 rows").should("be.visible");
    });

    it("applies a greater than filter", () => {
      modal().within(() => {
        cy.findByLabelText("Price").within(() => {
          cy.findByTestId("select-button").click();
        });
      });

      popover().within(() => {
        cy.findByText("Greater than").click();
      });

      modal().within(() => {
        cy.findByPlaceholderText("Enter a number").type("50");
        cy.button("Apply").click();
      });

      cy.findByText("Price is greater than 50").should("be.visible");
      cy.findByText("Showing 106 rows").should("be.visible");
    });

    it("infers a <= filter from an invalid between filter", () => {
      modal().within(() => {
        cy.findByLabelText("Price").within(() => {
          cy.findByPlaceholderText("max").type("50");
        });

        cy.button("Apply").click();
      });

      cy.findByText("Price is less than or equal to 50").should("be.visible");
      cy.findByText("Showing 94 rows").should("be.visible");
    });
  });
});

const modal = () => {
  return cy.get(".Modal");
};
