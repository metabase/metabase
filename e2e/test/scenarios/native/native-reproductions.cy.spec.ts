const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { IconName } from "metabase/ui";

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
      cy.findByText("Query results will appear here.").should("be.visible");
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

    cy.findByTestId("visualization-root").within(() => {
      cy.icon("warning").should("be.visible");
      cy.findByTestId("scalar-value").should("not.exist");
    });

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

  it("should not reset the suggestions when the query is edited (metabase#48712)", () => {
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

describe("issue 53194", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    Object.values(REVIEWS).forEach(fieldId => {
      cy.request("PUT", `/api/field/${fieldId}`, {
        visibility_type: "sensitive",
      });
    });
  });

  it("should not enter an infinite loop when browsing table fields (metabase#53194)", () => {
    H.startNewNativeQuestion();

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

describe("issue 53299", { tags: ["@mongo"] }, () => {
  beforeEach(() => {
    H.restore("mongo-5");
    cy.signInAsAdmin();
  });

  it("should be possible to switch to mongodb when editing an sql question (metabase#53299)", () => {
    H.startNewNativeQuestion();

    H.selectNativeEditorDataSource("QA Mongo");
    H.nativeEditorDataSource().should("contain", "QA Mongo");
  });
});

describe("issue 53171", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        name: `Question ${"a".repeat(100)}`,
        query: { "source-table": ORDERS_ID },
      },
      {
        idAlias: "longNameQuestionId",
        wrapId: true,
      },
    );
  });

  it("title and icons in data reference sidebar should not overflow (metabase#53171)", () => {
    H.startNewNativeQuestion();

    cy.get("@longNameQuestionId").then(longNameQuestion => {
      H.NativeEditor.type(`{{#${longNameQuestion}`);
    });

    cy.findByTestId("sidebar-content").within($container => {
      const [container] = $container;

      cy.findByTestId("sidebar-header").should($header => {
        const [header] = $header;
        const headerDescendants = header.querySelectorAll("*");

        headerDescendants.forEach(descendant => {
          H.assertDescendantNotOverflowsContainer(descendant, container);
        });
      });

      verifyIconVisibleAndSized("chevronleft", 16);
      verifyIconVisibleAndSized("table", 16);
      verifyIconVisibleAndSized("close", 18);
    });
  });

  function verifyIconVisibleAndSized(iconName: IconName, size: number) {
    cy.icon(iconName)
      .should("be.visible")
      .and(icon => {
        expect(icon.outerWidth()).to.equal(size);
        expect(icon.outerHeight()).to.equal(size);
      });
  }
});

describe("issue 54124", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        name: "Reference Question",
        query: { "source-table": ORDERS_ID },
      },
      {
        idAlias: "questionId",
        wrapId: true,
      },
    );
  });

  it("should be possible to close the data reference sidebar (metabase#54124)", () => {
    H.startNewNativeQuestion();

    cy.get("@questionId").then(questionId => {
      H.NativeEditor.type(
        `{{#${questionId}-reference-question }}{leftarrow}{leftarrow}{leftarrow}`,
      );
    });

    cy.findByTestId("sidebar-content").icon("close").click();
    cy.findByTestId("sidebar-content").should("not.exist");

    cy.log("moving cursor should open the reference sidebar again");
    H.NativeEditor.type("{leftarrow}{leftarrow}{leftarrow}");
    cy.findByTestId("sidebar-content").should("be.visible");
  });
});

describe("issues 52811, 52812", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("popovers should close when clicking outside (metabase#52811, metabase#52812)", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("{{x");
    cy.findByLabelText("Variable type").click();

    cy.log("popover should close when clicking away (metabase#52811)");
    H.popover().findByText("Field Filter").click();
    clickAway();
    cy.get(H.POPOVER_ELEMENT).should("not.exist");

    cy.log(
      "the default value input should not be rendered when 'Field to map to' is not set yet (metabase#52812)",
    );
    H.rightSidebar()
      .findByText("Default filter widget value")
      .should("not.exist");
    cy.findByLabelText("Always require a value").should("not.exist");

    cy.log(
      "existing popover should close when opening a new one (metabase#52811)",
    );
    cy.findByTestId("sidebar-content").findByText("Select...").click();
    cy.findByLabelText("Variable type").click();
    H.popover()
      .should("have.length", 1)
      .and("contain.text", "Field Filter")
      .and("not.contain.text", "Sample Database");
  });

  function clickAway() {
    cy.get("body").click(0, 0);
  }
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
    cy.location().should(location => expect(location.search).to.eq(""));
  });
});
