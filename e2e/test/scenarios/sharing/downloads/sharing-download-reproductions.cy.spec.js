const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, REVIEWS, REVIEWS_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("issue 10803", () => {
  const testCases = ["csv", "xlsx"];

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(
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

  it("should format the date properly in saved and unsaved questions (metabase#10803)", () => {
    cy.get("@questionId").then((questionId) => {
      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType, questionId });
      });
    });

    // Add a space at the end of the query to make it "dirty"
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains(/open editor/i).click();
    H.NativeEditor.focus().type("{movetoend} ");

    H.runNativeQuery();
    testCases.forEach((fileType) => {
      H.downloadAndAssert({ fileType });
    });
  });
});

describe("issue 18382", () => {
  /**
   * This question might seem a bit overwhelming at the first sight.
   * The whole point of this repro was to try to cover as much of the old syntax as possible.
   * We want to make sure it still works when loaded into a new(er) Metabase version.
   */

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
    H.restore();
    cy.signInAsAdmin();
    H.visitQuestionAdhoc(questionDetails);
  });

  it("should handle the old syntax in downloads (metabase#18382)", () => {
    testCases.forEach((fileType) => {
      H.downloadAndAssert({ fileType });
    });
  });
});

describe("issues 18440 and 18573", () => {
  const query = { "source-table": ORDERS_ID, limit: 5 };

  const questionDetails = {
    dataset_query: {
      type: "query",
      query,
      database: SAMPLE_DB_ID,
    },
  };

  const renamedColumnQuestionDetails = {
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

  const testCases = ["csv", "xlsx"];

  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("saveQuestion");

    H.restore();
    cy.signInAsAdmin();

    // Remap Product ID -> Product Title
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });
  });

  it("export should include remapped values and preserve renamed remapped columns (metabase#18440, metabase#18573)", () => {
    cy.log("ad-hoc question (metabase#18440-1)");
    H.visitQuestionAdhoc(questionDetails);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");

    testCases.forEach((fileType) => {
      H.downloadAndAssert({ fileType });
    });

    cy.log("saved question (metabase#18440-2)");
    H.createQuestion({ query }).then(({ body: { id } }) => {
      H.visitQuestion(id);

      cy.findByText("Product ID");
      cy.findByText("Awesome Concrete Shoes");

      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType, questionId: id });
      });
    });

    cy.log("renamed remapped column (metabase#18573)");
    H.visitQuestionAdhoc(renamedColumnQuestionDetails);

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Awesome Concrete Shoes");

    H.downloadAndAssert({ fileType: "xlsx" });
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

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should properly format the 'X of Y' dates in exports (metabase#18729)", () => {
    H.visitQuestionAdhoc(questionDetails);

    ["csv", "xlsx"].forEach((fileType) => {
      H.downloadAndAssert({ fileType });
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
    cy.findByTestId("save-question-modal").within((modal) => {
      cy.findByText("Save").click();
    });
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails, {
      loadMetadata: true,
      wrapId: true,
    });

    // Reorder columns a and b
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a").trigger("mousedown", 0, 0).wait(100); //Don't force the first interaction. This ensures things are actually visible to start moving
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a")
      .trigger("mousemove", 10, 10, { force: true })
      .wait(100);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a")
      .trigger("mousemove", 100, 0, { force: true })
      .wait(100);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("column a")
      .trigger("mouseup", 100, 0, { force: true })
      .wait(100);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Started from").click(); // Give DOM some time to update
  });

  it("should order columns correctly in unsaved and saved native query exports", () => {
    testCases.forEach((fileType) => {
      H.downloadAndAssert({ fileType });
    });

    saveAndOverwrite();

    cy.get("@questionId").then((questionId) => {
      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType, questionId });
      });
    });
  });

  it("should order columns correctly in saved native query exports when the query was modified but not re-run before save (#19889)", () => {
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains(/open editor/i).click();
    H.NativeEditor.focus().type(
      '{selectall}select 1 "column x", 2 "column y", 3 "column c"',
    );

    saveAndOverwrite();

    cy.get("@questionId").then((questionId) => {
      H.visitQuestion(questionId);

      testCases.forEach((fileType) => {
        H.downloadAndAssert({ fileType, questionId });
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

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails, {
      loadMetadata: true,
      wrapId: true,
    });

    cy.findByTestId("query-builder-main").findByText("Open Editor").click();
    H.NativeEditor.focus().type(', select 2 "column b"');
  });

  it("should be able to export unsaved native query results as CSV and XLSX even after the query has changed", () => {
    ["csv", "xlsx"].forEach((fileType) => {
      H.downloadAndAssert({ fileType });
    });
  });
});
