const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { IconName } from "metabase/ui";
import type { Database, ListDatabasesResponse } from "metabase-types/api";

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
    cy.visit("/question#" + H.adhocQuestionHash(questionDetails));
    cy.wait("@getDatabases");

    H.runNativeQuery({ wait: false });
    cy.findByTestId("query-builder-main")
      .findByText("Doing science...")
      .should("be.visible");
    cy.realPress([H.metaKey, "Enter"]);
    cy.findByTestId("query-builder-main")
      .findByText("Here's where your results will appear")
      .should("be.visible");
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

    H.filterWidget()
      .filter(
        `:contains("${QUESTION.native["template-tags"].state["display-name"]}")`,
      )
      .icon("revert")
      .should("not.exist");
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
    Object.values(REVIEWS).forEach((fieldId) => {
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

    cy.get("@longNameQuestionId").then((longNameQuestion) => {
      H.NativeEditor.type(`{{#${longNameQuestion}`);
    });

    cy.findByTestId("sidebar-content").within(($container) => {
      const [container] = $container;

      cy.findByTestId("sidebar-header").should(($header) => {
        const [header] = $header;
        const headerDescendants = header.querySelectorAll("*");

        headerDescendants.forEach((descendant) => {
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
      .and((icon) => {
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

    cy.get("@questionId").then((questionId) => {
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
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should remove parameter values from the URL when leaving the query builder and discarding changes (metabase#52806)", () => {
    cy.visit("/");
    H.newButton("SQL query").click();
    H.NativeEditor.focus().type("select {{x}}");
    cy.location().should((location) => expect(location.search).to.eq("?x="));
    cy.findByTestId("main-logo-link").click();
    H.modal().button("Discard changes").click();
    cy.findByTestId("home-page");
    cy.location().should((location) => expect(location.search).to.eq(""));
  });
});

describe("issue 55951", () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    cy.intercept<unknown, ListDatabasesResponse>(
      "GET",
      "/api/database",
      (request) => {
        request.continue((response) => {
          response.body.data = mockResponseData(response.body.data);
        });
      },
    ).as("getDatabases");
  });

  it("should not show loading state in database picker when databases are being reloaded (metabase#55951)", () => {
    cy.visit("/");
    cy.wait("@getDatabases");

    cy.intercept<unknown, ListDatabasesResponse>(
      "GET",
      "/api/database*",
      (request) => {
        request.continue((response) => {
          response.body.data = mockResponseData(response.body.data);

          // Setting this to be arbitrarly long so that H.repeatAssertion is guaranteed to detect the issue
          return new Promise((resolve) => setTimeout(resolve, 2000));
        });
      },
    );

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

describe("issue 54799", () => {
  const questionDetails = {
    native: {
      query: "select 'foo', 'bar'",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  function select(el: Cypress.Chainable, pos: Cypress.PositionType = "center") {
    const macOSX = Cypress.platform === "darwin";
    el.dblclick(pos, {
      metaKey: macOSX,
      ctrlKey: !macOSX,
    });
  }

  it("it should be possible to select multiple ranges and run those (metabase#54799)", () => {
    cy.findByTestId("visibility-toggler").click();

    cy.get("[data-testid=cell-data]").contains("foo").should("be.visible");
    cy.get("[data-testid=cell-data]").contains("bar").should("be.visible");

    select(H.NativeEditor.get().findByText("select"));
    select(H.NativeEditor.get().findByText("'foo'"));
    select(H.NativeEditor.get().findByText("'foo'"), "left");
    select(H.NativeEditor.get().findByText("'bar'"));
    select(H.NativeEditor.get().findByText("'bar'"), "right");

    getRunQueryButton().click();

    cy.get("[data-testid=cell-data]").contains(/^foo$/).should("not.exist");
    cy.get("[data-testid=cell-data]").contains(/^bar$/).should("not.exist");

    cy.get("[data-testid=cell-data]")
      .contains(/^'foobar'$/)
      .should("be.visible");
    cy.get("[data-testid=cell-data]")
      .contains(/foobar/)
      .should("be.visible");
  });
});

describe("issue 56570", () => {
  const questionDetails = {
    native: {
      query: `select '${"ab".repeat(200)}'`,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("should not push the toolbar off-screen (metabase#56570)", () => {
    cy.findByTestId("visibility-toggler").click();
    cy.findByTestId("native-query-editor-action-buttons").should("be.visible");
  });
});

describe("issue 53649", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not get caught in an infinite loop when opening the native editor (metabase#53649)", () => {
    H.startNewNativeModel();

    // If the app freezes, this won't work
    H.NativeEditor.type("select 1");
    H.NativeEditor.get().should("contain", "select 1");
  });
});

describe("issue 57441", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to create a new snippet from the sidebar (metabase#57441)", () => {
    H.startNewNativeQuestion();

    H.createSnippet({ name: "snippet 1", content: "select 1" });

    cy.findByTestId("native-query-editor-action-buttons")
      .icon("snippet")
      .click();
    H.rightSidebar().icon("add").click();
    H.popover().findByText("New snippet").click();
    H.modal().findByText("Create your new snippet").should("be.visible");
  });
});

describe("issue 56905", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.startNewNativeQuestion();
  });

  it("It should be possible to run the native query when a parameter value input is focused (metabase#56905)", () => {
    H.NativeEditor.type("select {{ foo }}");
    cy.findByPlaceholderText("Foo").type("foobar", { delay: 0 });

    const isMac = Cypress.platform === "darwin";
    const metaKey = isMac ? "Meta" : "Control";
    cy.realPress([metaKey, "Enter"]);

    cy.findByTestId("query-visualization-root")
      .findByText("foobar")
      .should("be.visible");
  });
});

describe("issue 57644", () => {
  describe("with only one database", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      H.startNewNativeQuestion({
        database: null,
        query: "",
      });
    });

    it("should not open the database picker when opening the native query editor when there is only one database (metabase#57644)", () => {
      cy.findByTestId("native-query-top-bar")
        .findByText("Select a database")
        .should("be.visible");

      // The popover should not be visible, we give it a timeout here because the
      // popover disappears immediately and we don't want that to make the test pass.
      cy.findAllByRole("dialog", { timeout: 0 }).should("not.exist");
    });
  });

  describe("with multiple databases", () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();

      H.startNewNativeQuestion({
        database: null,
        query: "",
      });
    });

    it("should open the database picker when opening the native query editor and there are multiple databases (metabase#57644)", () => {
      H.popover()
        .should("be.visible")
        .and("contain", "Sample Database")
        .and("contain", "QA Postgres12");
    });
  });
});

describe("issue 51679", () => {
  const questionDetails: NativeQuestionDetails = {
    native: {
      query: "SELECT {{var}}",
      "template-tags": {
        var: {
          id: "754ae827-661c-4fc9-b511-c0fb7b6bae2b",
          name: "var",
          type: "text",
          "display-name": "Var",
        },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to change the template tag type when the required field for a field filter is not set (metabase#51679)", () => {
    H.createNativeQuestion(questionDetails, { visitQuestion: true });
    H.queryBuilderMain().within(() => {
      cy.findByTestId("visibility-toggler").click();
      cy.icon("variable").click();
    });
    H.rightSidebar().findByTestId("variable-type-select").click();
    H.popover().findByText("Field Filter").click();

    cy.log("without selecting the field, try to change the type again");
    H.rightSidebar().findByTestId("variable-type-select").click();
    H.popover().findByText("Number").click();
    H.rightSidebar()
      .findByTestId("variable-type-select")
      .should("have.value", "Number");
  });
});

describe("issue 59110", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow dragging border to completely hide native query editor (metabase#59110)", () => {
    H.startNewNativeQuestion();

    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .should("not.exist");

    H.NativeEditor.get().then((editor) => {
      const { height } = editor[0].getBoundingClientRect();
      const diff = height + 20;

      cy.log("drag the border to hide the editor");

      cy.findByTestId("drag-handle").then((handle) => {
        const coordsDrag = handle[0].getBoundingClientRect();

        cy.wrap(handle)
          .trigger("mousedown", {
            clientX: coordsDrag.x,
            clientY: coordsDrag.y,
          })
          .trigger("mousemove", {
            clientX: coordsDrag.x,
            clientY: coordsDrag.y - diff,
          });
      });
    });

    H.NativeEditor.get().should("not.exist");
    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .should("be.visible")
      .click();

    cy.log("verify that editor height is restored");
    H.NativeEditor.get().then((editor) => {
      const { height } = editor[0].getBoundingClientRect();
      expect(height).to.be.greaterThan(100);
    });
  });
});

describe("issue 60719", () => {
  const question1Details: NativeQuestionDetails = {
    name: "Q1",
    native: {
      query: "select 1 as num",
      "template-tags": {},
    },
  };

  function getQuestion2Details(card1Id: number): StructuredQuestionDetails {
    return {
      name: "Q2",
      query: {
        "source-table": `card__${card1Id}`,
      },
    };
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should prevent saving a native query with a circular reference (metabase#60719)", () => {
    H.createNativeQuestion(question1Details).then(({ body: card1 }) => {
      H.createQuestion(getQuestion2Details(card1.id)).then(
        ({ body: card2 }) => {
          H.visitQuestion(card1.id);
          cy.findByTestId("visibility-toggler").click();
          H.NativeEditor.clear().type(`select * from {{#${card2.id}-q2}}`);
        },
      );
    });
    H.queryBuilderHeader().button("Save").click();
    H.modal().within(() => {
      cy.button("Save").click();
      cy.wait("@updateCard");
      cy.findByText("Cannot save card with cycles.").should("be.visible");
    });
  });
});

describe("issue 59356", () => {
  function typeRunShortcut() {
    const isMac = Cypress.platform === "darwin";
    const metaKey = isMac ? "Meta" : "Control";
    cy.realPress([metaKey, "Enter"]);
  }

  function getLoader() {
    return H.queryBuilderMain().findByTestId("loading-indicator");
  }

  function getEmptyStateMessage() {
    return H.queryBuilderMain().findByText(
      "Here's where your results will appear",
    );
  }

  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should properly cancel the query via the keyboard shortcut (metabase#59356)", () => {
    cy.log("open the native query");
    H.startNewNativeQuestion({
      database: WRITABLE_DB_ID,
      query: "select pg_sleep(5000)",
    });

    cy.log("verify that the query is not running");
    getLoader().should("not.exist");
    getEmptyStateMessage().should("be.visible");
    cy.get("@dataset.all").should("have.length", 0);

    cy.log("run the query and verify that it is running");
    typeRunShortcut();
    getLoader().should("be.visible");
    getEmptyStateMessage().should("not.exist");
    cy.get("@dataset.all").should("have.length", 1);

    cy.log("cancel the query and verify that no new query is running");
    typeRunShortcut();
    getLoader().should("not.exist");
    getEmptyStateMessage().should("be.visible");
    cy.get("@dataset.all").should("have.length", 1);

    cy.log("run the query again and verify that it is running");
    typeRunShortcut();
    getLoader().should("be.visible");
    getEmptyStateMessage().should("not.exist");
    cy.get("@dataset.all").should("have.length", 2);

    cy.log("cancel the query and verify that no new query is running");
    typeRunShortcut();
    getLoader().should("not.exist");
    getEmptyStateMessage().should("be.visible");
    cy.get("@dataset.all").should("have.length", 2);
  });
});

describe("issue 63711", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("Completions should be visible when there are a lot of options (metabase#63711)", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("s");

    cy.log("completions should be scrollable");
    H.NativeEditor.completions()
      .findByLabelText("Completions")
      .then(($el) => {
        const element = $el[0];
        cy.wrap(element.scrollHeight).should("be.gt", element.clientHeight);
      });

    cy.log("completions should not cut off the height of the inner element");
    H.NativeEditor.completion("SAVEPOINT")
      .should("be.visible")
      .then(($outerElement) => {
        cy.wrap($outerElement)
          .findByText("AVEPOINT")
          .should("be.visible")
          .then(($innerElement) => {
            cy.wrap($innerElement[0].offsetHeight).should(
              "be.eq",
              $outerElement[0].clientHeight,
            );
          });
      });
  });
});

describe("issue 66745", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("PUT", "/api/card/*").as("saveCard");
  });

  ["row", "bar"].forEach((vizType) => {
    it(`should not break visualization on native query column rename (metabase#63711) - ${vizType}`, () => {
      H.createNativeQuestion(
        {
          name: `66745 - ${vizType}`,
          native: {
            query:
              'SELECT \'Category 1\' AS CATEGORY_NAME, \'Category 2\' AS CATEGORY_NAME2, 100 AS "Total", 60 AS "Hello", 40 AS "World"',
          },
          display: vizType,
          visualization_settings: {
            "graph.dimensions": ["CATEGORY_NAME"],
            "graph.metrics": ["Total", "World"],
          },
        },
        {
          wrapId: true,
          visitQuestion: true,
        },
      );

      cy.findByTestId("query-builder-main")
        .findByText("Open Editor")
        .should("be.visible")
        .click();

      H.NativeEditor.focus().type('{backspace}2"');

      getRunQueryButton().click();
      cy.wait("@dataset");

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Total").should("be.visible");
        cy.findByText("World").should("not.exist");
      });

      cy.findByTestId("qb-header-action-panel").findByText("Save").click();

      H.modal().findByText("Save").click();

      cy.wait("@saveCard");

      cy.findByTestId("qb-header-action-panel")
        .findByText("Save")
        .should("not.exist");

      H.visitQuestion("@questionId");

      cy.wait("@getCard");
      cy.wait("@cardQuery");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors
      cy.findByText("Something’s gone wrong").should("not.exist");

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Total").should("be.visible");
        cy.findByText("World").should("not.exist");
      });

      H.openVizSettingsSidebar();
      H.leftSidebar().within(() => {
        cy.findAllByPlaceholderText("Select a field").should("have.length", 2);
        cy.findAllByPlaceholderText("Select a field")
          .eq(1)
          .should("have.value", "Total");
      });
    });
  });
});

describe("issue 51717", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should open question info sidebar when variables sidebar is already open (metabase#51717)", () => {
    H.createNativeQuestion(
      {
        name: "42",
        native: { query: "select 42" },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .click();

    cy.log("Open variables sidebar");
    cy.findByTestId("native-query-editor-action-buttons")
      .should("be.visible")
      .findByLabelText("Variables")
      .click();
    cy.findByTestId("sidebar-right")
      .should("be.visible")
      .and("contain", "Variables and parameters");

    cy.log("Info sidebar is opened");
    H.openQuestionInfoSidesheet();
    cy.findByTestId("sidesheet")
      .as("infoSidebar")
      .should("be.visible")
      .and("contain", "Info");

    cy.log("Make sure info sidebar is interactive (on top of the stack)");
    cy.get("@infoSidebar").findByRole("tab", { name: "History" }).click();
    cy.get("@infoSidebar").should("contain", "You created this");
  });
});

describe("issue 59075", () => {
  const WINDOW_HEIGHT = 1000;
  const BUTTON_INDEX = 0;

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.startNewNativeQuestion();
    cy.viewport(1024, WINDOW_HEIGHT);
  });

  it("should not be possible to resize the native query editor too far (metabase#59075)", () => {
    cy.findByTestId("drag-handle").then((handle) => {
      const coordsDrag = handle[0].getBoundingClientRect();

      cy.wrap(handle)
        .trigger("mousedown", {
          button: BUTTON_INDEX,
          clientX: coordsDrag.x,
          clientY: coordsDrag.y,
          force: true,
        })
        // Drag to the bottom of the screen
        .trigger("mousemove", {
          button: BUTTON_INDEX,
          clientX: coordsDrag.x,
          clientY: WINDOW_HEIGHT + 10,
          force: true,
        })
        .trigger("mouseup");
    });

    H.NativeEditor.get().then((editor) => {
      const { bottom } = editor.get()[0].getBoundingClientRect();
      cy.wrap(bottom).should("be.lessThan", WINDOW_HEIGHT - 50);
    });
  });
});
