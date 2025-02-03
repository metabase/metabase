const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import { getRunQueryButton } from "../native-filters/helpers/e2e-sql-filter-helpers";
const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 11727", { tags: "@external" }, () => {
  const PG_DB_ID = 2;

  const questionDetails = {
    dataset_query: {
      type: "native",
      database: PG_DB_ID,
      native: {
        query: "SELECT pg_sleep(10)",
      },
    },
  };

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database").as("getDatabases");
  });

  it("should cancel the native query via the keyboard shortcut (metabase#11727)", () => {
    H.withDatabase(PG_DB_ID, () => {
      cy.visit("/question#" + H.adhocQuestionHash(questionDetails));
      cy.wait("@getDatabases");

      H.runNativeQuery({ wait: false });
      cy.findByText("Doing science...").should("be.visible");
      cy.get("body").type("{cmd}{enter}");
      cy.findByText("Here's where your results will appear").should(
        "be.visible",
      );
    });
  });
});

describe("issue 16584", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should pass parameters when running with 'Run select text' (metabase#16584)", () => {
    // The bug described in is #16584 can be further simplified:
    // - the issue persists even when selecting the *entire* query
    // - the issue is unrelated to using a date filter, using a text filter works too
    // - the issue is unrelated to whether or not the parameter is required or if default value is set
    // - the space at the end of the query is not needed to reproduce this issue
    H.startNewNativeQuestion();
    H.NativeEditor.type(
      "SELECT COUNTRY FROM ACCOUNTS WHERE COUNTRY = {{ country }} LIMIT 1",
    ).type("{selectAll}");

    cy.findByPlaceholderText("Country").type("NL", { delay: 0 });

    H.NativeEditor.selectAll();
    H.runNativeQuery();

    cy.findByTestId("query-visualization-root")
      .findByText("NL")
      .should("exist");
  });
});

describe("issue 38083", () => {
  const QUESTION = {
    name: "SQL query with a date parameter",
    native: {
      query: "select * from people where state = {{ state }} limit 1",
      "template-tags": {
        state: {
          id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
          type: "text" as const,
          name: "state",
          "display-name": "State",
          "widget-type": "string/=",
          default: "CA",
          required: true,
        },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show the revert to default icon when the default value is selected (metabase#38083)", () => {
    H.createNativeQuestion(QUESTION, {
      visitQuestion: true,
    });

    cy.get("legend")
      .contains(QUESTION.native["template-tags"].state["display-name"])
      .parent("fieldset")
      .within(() => {
        cy.icon("revert").should("not.exist");
      });
  });
});

describe("issue 33327", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should recover from a visualization error (metabase#33327)", () => {
    const query = "SELECT 1";
    H.createNativeQuestion(
      { native: { query }, display: "scalar" },
      {
        visitQuestion: true,
      },
    );

    cy.findByTestId("scalar-value").should("have.text", "1");

    cy.findByTestId("visibility-toggler").click();
    H.NativeEditor.get().should("contain", query);
    H.NativeEditor.type("{leftarrow}--");

    cy.intercept("POST", "/api/dataset").as("dataset");
    H.NativeEditor.get().should("be.visible").and("contain", "SELECT --1");
    getRunQueryButton().click();
    cy.wait("@dataset");

    cy.findByTestId("visualization-root").icon("warning").should("be.visible");
    cy.findByTestId("scalar-value").should("not.exist");

    H.NativeEditor.get().should("contain", "SELECT --1");
    H.NativeEditor.type("{leftarrow}{backspace}{backspace}");

    H.NativeEditor.get().should("contain", query);

    getRunQueryButton().click();
    cy.wait("@dataset");

    cy.findByTestId("scalar-value").should("have.text", "1");
    cy.findByTestId("visualization-root").icon("warning").should("not.exist");
  });
});

describe("issue 49454", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion({
      name: "Test Metric 49454",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    });
    H.createQuestion({
      name: "Test Question 49454",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    });
  });

  it("should be possible to use metrics in native queries (metabase#49454, metabase#51035)", () => {
    H.startNewNativeQuestion();

    cy.log("should not show empty tooltip (metabase#51035)");
    cy.button("Save").realHover();
    H.tooltip().should("not.exist");

    H.NativeEditor.type("select * from {{ #test");

    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("-question-49454").should("be.visible");
      H.NativeEditor.completion("-metric-49454").should("be.visible");
    });
  });
});

describe("issue 48712", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not reset the suggesions when the query is edited (metabase#48712)", () => {
    H.startNewNativeQuestion();

    H.NativeEditor.type("pro");
    H.NativeEditor.completion("PRODUCTS").should("be.visible");

    H.NativeEditor.type("{backspace}{backspace}{backspace}");
    H.NativeEditor.type("select * from pro");

    H.NativeEditor.completion("PRODUCTS").should("be.visible");

    H.NativeEditor.type("{nextcompletion}", { focus: false });
    H.NativeEditor.completion("PROCEDURE").should("have.attr", "aria-selected");

    // wait for all completions to finish
    cy.wait(1000);
    H.NativeEditor.completion("PROCEDURE").should("have.attr", "aria-selected");
  });
});
