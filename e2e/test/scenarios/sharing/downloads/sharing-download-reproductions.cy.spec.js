import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  downloadAndAssert,
  runNativeQuery,
  visitQuestion,
  visitQuestionAdhoc,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, REVIEWS, REVIEWS_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("issue 10803", () => {
  const testCases = ["csv", "xlsx"];

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        name: "10803",
        native: {
          query:
            "SELECT cast(parsedatetime('2026-06-03', 'yyyy-MM-dd') AS timestamp) AS \"birth_date\", cast(parsedatetime('2026-06-03 23:41:23', 'yyyy-MM-dd HH:mm:ss') AS timestamp) AS \"created_at\"",
        },
      },
      { visitQuestion: true, wrapId: true },
    );
  });

  testCases.forEach(fileType => {
    it(`should format the date properly for ${fileType} in saved questions (metabase#10803)`, () => {
      cy.get("@questionId").then(questionId => {
        downloadAndAssert(
          { fileType, questionId, logResults: true, raw: true },
          testWorkbookDatetimes,
        );
      });
    });

    it(`should format the date properly for ${fileType} in unsaved questions`, () => {
      // Add a space at the end of the query to make it "dirty"
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(/open editor/i).click();
      cy.get(".ace_editor").type("{movetoend} ");

      runNativeQuery();
      downloadAndAssert({ fileType, raw: true }, testWorkbookDatetimes);
    });

    function testWorkbookDatetimes(sheet) {
      expect(sheet["A1"].v).to.eq("birth_date");
      expect(sheet["B1"].v).to.eq("created_at");

      // Excel and CSV will have different formats
      if (fileType === "csv") {
        expect(sheet["A2"].v).to.eq("June 3, 2026, 12:00 AM");
        expect(sheet["B2"].v).to.eq("June 3, 2026, 11:41 PM");
      } else if (fileType === "xlsx") {
        // We tell the xlsx library to read raw and not parse dates
        // So for the _date_ format we expect an integer
        // And for timestamp, we expect a float
        expect(sheet["A2"].v).to.eq(46176);
        expect(sheet["B2"].v).to.eq(46176.98707175926);
      }
    }
  });
});

describe.skip("issue 18219", () => {
  const questionDetails = {
    name: "18219",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
    },
  };

  const testCases = ["csv", "xlsx"];

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  testCases.forEach(fileType => {
    it("should format temporal units on export (metabase#18219)", () => {
      cy.createQuestion(questionDetails).then(
        ({ body: { id: questionId } }) => {
          visitQuestion(questionId);

          cy.findByText("Created At: Year");
          cy.findByText("2022");
          cy.findByText("744");

          downloadAndAssert({ fileType, questionId, raw: true }, assertion);
        },
      );
    });

    function assertion(sheet) {
      expect(sheet["A1"].v).to.eq("Created At: Year");

      if (fileType === "csv") {
        expect(sheet["A2"].v).to.eq("2022");
      }

      if (fileType === "xlsx") {
        /**
         * Depending on how we end up solving this issue,
         * the following assertion on the cell type might not be correct.
         * It's very likely we'll format temporal breakouts as strings.
         * I.e. we have to take into account Q1, Q2, etc.
         */
        // expect(A2.t).to.eq("n");

        /**
         * Because of the excel date format, we cannot assert on the raw value `v`.
         * Rather, we have to do it on the parsed value `w`.
         */
        expect(sheet["A2"].w).to.eq("2022");
      }
    }
  });
});

describe("issue 18382", () => {
  /**
   * This question might seem a bit overwhelming at the first sight.
   * The whole point of this repro was to try to cover as much of the old syntax as possible.
   * We want to make sure it still works when loaded into a new(er) Metabase version.
   */

  function assertion(sheet) {
    expect(sheet["A1"].v).to.eq("MOD:Title");
    expect(sheet["B1"].v).to.eq("MOD:ID");
    expect(sheet["C1"].v).to.eq("MOD:Reviewer");

    expect(sheet["A2"].v).to.eq("Aerodynamic Concrete Bench");
  }

  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": REVIEWS_ID,
        joins: [
          {
            fields: [
              ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]],
            ],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", REVIEWS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
        filter: ["and", ["=", ["field-id", REVIEWS.RATING], 4]],
        "order-by": [
          ["asc", ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]]],
        ],
        fields: [
          ["field-id", REVIEWS.ID],
          ["field-id", REVIEWS.REVIEWER],
        ],
        limit: 5,
      },
    },
    display: "table",
    visualization_settings: {
      column_settings: {
        [`["ref",["field",${REVIEWS.ID},null]]`]: {
          column_title: "MOD:ID",
        },
        [`["ref",["field",${REVIEWS.REVIEWER},null]]`]: {
          column_title: "MOD:Reviewer",
        },
        [`["ref",["field",${PRODUCTS.TITLE},null]]`]: {
          column_title: "MOD:Title",
        },
      },
      // Reorder columns
      "table.columns": [
        {
          name: "TITLE",
          fieldRef: ["joined-field", "Products", ["field-id", PRODUCTS.TITLE]],
          enabled: true,
        },
        {
          name: "ID",
          fieldRef: ["field-id", REVIEWS.ID],
          enabled: true,
        },
        {
          name: "REVIEWER",
          fieldRef: ["field-id", REVIEWS.REVIEWER],
          enabled: true,
        },
      ],
    },
  };

  const testCases = ["csv", "xlsx"];

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    visitQuestionAdhoc(questionDetails);
  });

  testCases.forEach(fileType => {
    it(`should handle the old syntax in downloads for ${fileType} (metabase#18382)`, () => {
      // TODO: Please remove this line when issue gets fixed
      cy.skipOn(fileType === "csv");

      downloadAndAssert({ fileType }, assertion);
    });
  });
});

describe("issue 18440", () => {
  const query = { "source-table": ORDERS_ID, limit: 5 };

  const questionDetails = {
    dataset_query: {
      type: "query",
      query,
      database: SAMPLE_DB_ID,
    },
  };

  const testCases = ["csv", "xlsx"];

  function assertion(sheet) {
    expect(sheet["C1"].v).to.eq("Product ID");
    expect(sheet["C2"].v).to.eq("Awesome Concrete Shoes");
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("saveQuestion");

    restore();
    cy.signInAsAdmin();

    // Remap Product ID -> Product Title
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });
  });

  testCases.forEach(fileType => {
    it(`export should include a column with remapped values for ${fileType} (metabase#18440-1)`, () => {
      visitQuestionAdhoc(questionDetails);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Product ID");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Awesome Concrete Shoes");

      downloadAndAssert({ fileType }, assertion);
    });

    it(`export should include a column with remapped values for ${fileType} for a saved question (metabase#18440-2)`, () => {
      cy.createQuestion({ query }).then(({ body: { id } }) => {
        visitQuestion(id);

        cy.findByText("Product ID");
        cy.findByText("Awesome Concrete Shoes");

        downloadAndAssert({ fileType, questionId: id }, assertion);
      });
    });
  });
});

describe("issue 18573", () => {
  const questionDetails = {
    dataset_query: {
      type: "query",
      query: { "source-table": ORDERS_ID, limit: 2 },
      database: SAMPLE_DB_ID,
    },
    visualization_settings: {
      column_settings: {
        [`["ref",["field",${ORDERS.PRODUCT_ID},null]]`]: {
          column_title: "Foo",
        },
      },
    },
  };
  function assertion(sheet) {
    expect(sheet["C1"].v).to.eq("Foo");
    expect(sheet["C2"].v).to.eq("Awesome Concrete Shoes");
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Remap Product ID -> Product Title
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });
  });

  it("for the remapped columns, it should preserve renamed column name in exports for xlsx (metabase#18573)", () => {
    visitQuestionAdhoc(questionDetails);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");

    downloadAndAssert({ fileType: "xlsx" }, assertion);
  });
});

describe("issue 18729", () => {
  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month-of-year" }],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
        limit: 2,
      },
      type: "query",
    },
    display: "line",
  };

  function assertion(sheet) {
    // It currently says only "Created At", but that is already covered in an issue #18219.

    // TODO: When 18219 gets fixed, uncomment the following assertion and delete the `contain` one.
    // expect(sheet["A1"].v).to.eq("Created At: Month of year");
    expect(sheet["A1"].v).to.contain("Created At");

    // Based on how this issue gets resolved, the following assertions might need to change!

    expect(sheet["A2"].v).to.eq(1);
    expect(sheet["A2"].t).to.eq("n");
    // Parsed values are always in the form of a string
    expect(sheet["A2"].w).to.eq("1");
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  ["csv", "xlsx"].forEach(fileType => {
    it(`should properly format the 'X of Y'dates in ${fileType} exports (metabase#18729)`, () => {
      visitQuestionAdhoc(questionDetails);

      downloadAndAssert({ fileType }, assertion);
    });
  });
});

describe("issue 19889", () => {
  const questionDetails = {
    name: "19889",
    native: {
      query: 'select 1 "column a", 2 "column b", 3 "column c"',
    },
  };

  const testCases = ["csv", "xlsx"];

  function saveAndOverwrite() {
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, {
      loadMetadata: true,
      wrapId: true,
    });

    // Reorder columns a and b
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a").trigger("mousedown", 0, 0).wait(100); //Don't force the first interaction. This ensures things are actually visible to start moving
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a")
      .trigger("mousemove", 10, 10, { force: true })
      .wait(100);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a")
      .trigger("mousemove", 100, 0, { force: true })
      .wait(100);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a")
      .trigger("mouseup", 100, 0, { force: true })
      .wait(100);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Started from").click(); // Give DOM some time to update
  });

  testCases.forEach(fileType => {
    it("should order columns correctly in unsaved native query exports", () => {
      downloadAndAssert({ fileType, raw: true }, sheet => {
        expect(sheet["A1"].v).to.equal("column b");
        expect(sheet["B1"].v).to.equal("column a");
        expect(sheet["C1"].v).to.equal("column c");
      });
    });

    it("should order columns correctly in saved native query exports", () => {
      saveAndOverwrite();

      cy.get("@questionId").then(questionId => {
        downloadAndAssert({ fileType, questionId, raw: true }, sheet => {
          expect(sheet["A1"].v).to.equal("column b");
          expect(sheet["B1"].v).to.equal("column a");
          expect(sheet["C1"].v).to.equal("column c");
        });
      });
    });

    it("should order columns correctly in saved native query exports when the query was modified but not re-run before save (#19889)", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(/open editor/i).click();
      cy.get(".ace_editor").type(
        '{selectall}select 1 "column x", 2 "column y", 3 "column c"',
      );

      saveAndOverwrite();

      cy.get("@questionId").then(questionId => {
        visitQuestion(questionId);

        downloadAndAssert({ fileType, questionId, raw: true }, sheet => {
          expect(sheet["A1"].v).to.equal("column x");
          expect(sheet["B1"].v).to.equal("column y");
          expect(sheet["C1"].v).to.equal("column c");
        });
      });
    });
  });
});

describe("metabase#28834", () => {
  const questionDetails = {
    name: "28834",
    native: {
      query: 'select 1 "column a"',
    },
  };

  // I have a test for saved native questions in `QueryBuilder.unit.spec.tsx`.
  // Initially, this test was planned as a unit test, but with some technical
  // difficulties, I've decided to test with Cypress instead.

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, {
      loadMetadata: true,
      wrapId: true,
    });

    cy.findByTestId("query-builder-main").findByText("Open Editor").click();
    cy.get(".ace_editor").should("be.visible").type(', select 2 "column b"');
  });

  it("should be able to export unsaved native query results as CSV even after the query has changed", () => {
    const fileType = "csv";
    downloadAndAssert({ fileType, raw: true }, sheet => {
      expect(sheet["A1"].v).to.equal("column a");
      expect(sheet["A2"].v).to.equal("1");
      expect(sheet["A3"]).to.be.undefined;
    });
  });

  it("should be able to export unsaved native query results as XLSX even after the query has changed", () => {
    const fileType = "xlsx";
    downloadAndAssert({ fileType, raw: true }, sheet => {
      expect(sheet["A1"].v).to.equal("column a");
      expect(sheet["A2"].v).to.equal(1);
      expect(sheet["A3"]).to.be.undefined;
    });
  });
});
