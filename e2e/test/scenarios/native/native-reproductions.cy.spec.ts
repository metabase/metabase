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
    cy.restore("postgres-12");
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database").as("getDatabases");
  });

  it("should cancel the native query via the keyboard shortcut (metabase#11727)", () => {
    cy.withDatabase(PG_DB_ID, () => {
      cy.visit("/question#" + cy.adhocQuestionHash(questionDetails));
      cy.wait("@getDatabases");

      cy.runNativeQuery({ wait: false });
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
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should pass parameters when running with 'Run select text' (metabase#16584)", () => {
    // The bug described in is #16584 can be further simplified:
    // - the issue persists even when selecting the *entire* query
    // - the issue is unrelated to using a date filter, using a text filter works too
    // - the issue is unrelated to whether or not the parameter is required or if default value is set
    // - the space at the end of the query is not needed to reproduce this issue
    cy.openNativeEditor()
      .type(
        "SELECT COUNTRY FROM ACCOUNTS WHERE COUNTRY = {{ country }} LIMIT 1",
        {
          parseSpecialCharSequences: false,
          delay: 0,
        },
      )
      .type("{selectAll}");

    cy.findByPlaceholderText("Country").type("NL", { delay: 0 });

    cy.runNativeQuery();

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
    cy.restore();
    cy.signInAsAdmin();
  });

  it("should not show the revert to default icon when the default value is selected (metabase#38083)", () => {
    cy.createNativeQuestion(QUESTION, {
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
    cy.restore();
    cy.signInAsAdmin();
  });

  it("should recover from a visualization error (metabase#33327)", () => {
    const query = "SELECT 1";
    cy.createNativeQuestion(
      { native: { query }, display: "scalar" },
      {
        visitQuestion: true,
      },
    );

    cy.findByTestId("scalar-value").should("have.text", "1");

    cy.findByTestId("visibility-toggler").click();
    cy.focusNativeEditor().should("contain", query).type("{leftarrow}--");

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.nativeEditor().should("be.visible").and("contain", "SELECT --1");
    getRunQueryButton().click();
    cy.wait("@dataset");

    cy.findByTestId("visualization-root").icon("warning").should("be.visible");
    cy.findByTestId("scalar-value").should("not.exist");

    cy.focusNativeEditor()
      .should("contain", "SELECT --1")
      .type("{leftarrow}{backspace}{backspace}")
      .should("contain", query);

    getRunQueryButton().click();
    cy.wait("@dataset");

    cy.findByTestId("scalar-value").should("have.text", "1");
    cy.findByTestId("visualization-root").icon("warning").should("not.exist");
  });
});

describe("issue 49454", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.createQuestion({
      name: "Test Metric 49454",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    });
    cy.createQuestion({
      name: "Test Question 49454",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    });
  });

  it("should be possible to use metrics in native queries (metabase#49454)", () => {
    cy.openNativeEditor().type("select * from {{ #test");

    cy.nativeEditorCompletions().within(() => {
      cy.findByText("-question-49454").should("be.visible");
      cy.findByText("-metric-49454").should("be.visible");
    });
  });
});
