const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Database } from "metabase-types/api";

import { getRunQueryButton } from "../native-filters/helpers/e2e-sql-filter-helpers";
const { ORDERS_ID, REVIEWS } = SAMPLE_DATABASE;

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
    H.startNewNativeQuestion()
      .type(
        "SELECT COUNTRY FROM ACCOUNTS WHERE COUNTRY = {{ country }} LIMIT 1",
        {
          parseSpecialCharSequences: false,
          delay: 0,
        },
      )
      .type("{selectAll}");

    cy.findByPlaceholderText("Country").type("NL", { delay: 0 });

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
    H.focusNativeEditor().should("contain", query).type("{leftarrow}--");

    cy.intercept("POST", "/api/dataset").as("dataset");
    H.nativeEditor().should("be.visible").and("contain", "SELECT --1");
    getRunQueryButton().click();
    cy.wait("@dataset");

    cy.findByTestId("visualization-root").within(() => {
      cy.icon("warning").should("be.visible");
      cy.findByTestId("scalar-value").should("not.exist");
    });

    H.focusNativeEditor()
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

    H.nativeEditor().type("select * from {{ #test");

    H.nativeEditorCompletions().within(() => {
      cy.findByText("-question-49454").should("be.visible");
      cy.findByText("-metric-49454").should("be.visible");
    });
  });
});

describe("issue 53194", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    Object.values(REVIEWS).forEach((fieldId) => {
      cy.request("PUT", `/api/field/${fieldId}`, {
        visibility_type: "sensitive",
      });
    });
  });

  it("should not enter an infinite loop when browsing table fields (metabase#53194)", () => {
    H.startNewNativeQuestion();
    cy.icon("reference").click();

    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("REVIEWS").click(); // the infinite loop used to start with this action
      cy.findByText("ID").should("not.exist");
      cy.findByText("ORDERS").should("not.exist");

      cy.findByTestId("sidebar-header-title").click(); // if app is frozen, Cypress won't be able to execute this
      cy.findByText("ID").should("not.exist");
      cy.findByText("REVIEWS").should("be.visible");

      cy.findByText("ORDERS").click();
      cy.findByText("ID").should("be.visible");
    });
  });
});

describe("issue 52812", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("popovers should close when clicking outside (metabase#52812)", () => {
    H.startNewNativeQuestion();
    H.nativeEditor().type("{{x");
    cy.findAllByLabelText("Variable type").filter(":visible").click();

    H.popover().findByText("Field Filter").click();

    cy.log(
      "the default value input should not be rendered when 'Field to map to' is not set yet (metabase#52812)",
    );
    H.rightSidebar()
      .findByText("Default filter widget value")
      .should("not.exist");
    cy.findByLabelText("Always require a value").should("not.exist");
  });
});

describe("issue 52806", () => {
  const questionDetails = {
    name: "SQL",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native",
      native: {
        query: "SELECT * FROM ORDERS WHERE ID = {{id}}",
        "template-tags": {
          id: {
            id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
            name: "id",
            "display-name": "ID",
            type: "number",
            default: "1",
          },
        },
      },
    },
    visualization_settings: {},
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should remove parameter values from the URL when leaving the query builder and discarding changes (metabase#52806)", () => {
    H.visitQuestionAdhoc(questionDetails);
    cy.findByTestId("main-logo-link").click();
    H.modal().button("Discard changes").click();
    cy.location().should((location) => expect(location.search).to.eq(""));
  });
});

describe("issue 55951", () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/database", (request) => {
      request.continue((response) => {
        response.body.data = mockResponseData(response.body.data);
      });
    }).as("getDatabases");
  });

  it("should not show loading state in database picker when databases are being reloaded (metabase#55951)", () => {
    cy.visit("/");
    cy.wait("@getDatabases");

    cy.intercept("GET", "/api/database*", (request) => {
      request.continue((response) => {
        response.body.data = mockResponseData(response.body.data);

        // Setting this to be arbitrarly long so that H.repeatAssertion is guaranteed to detect the issue
        return new Promise((resolve) => setTimeout(resolve, 2000));
      });
    });

    H.newButton("SQL query").click();
    H.popover()
      .should("be.visible")
      .within(() => {
        cy.findByText("QA Postgres12").should("be.visible");
        cy.findByText("Sample Database").should("be.visible");

        H.repeatAssertion(() => {
          cy.findByTestId("loading-indicator", { timeout: 250 }).should(
            "not.exist",
          );
        });
      });
  });

  function mockResponseData(databases: Database[]) {
    return databases.map((database) => ({
      ...database,
      initial_sync_status: "incomplete" as const,
    }));
  }
});
