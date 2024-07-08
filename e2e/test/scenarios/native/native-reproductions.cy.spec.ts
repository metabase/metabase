import {
  restore,
  withDatabase,
  adhocQuestionHash,
  runNativeQuery,
  openNativeEditor,
  createNativeQuestion,
  visitPublicQuestion,
  visitDashboard,
  editDashboard,
  popover,
  dashboardParameterSidebar,
  saveDashboard,
  visitPublicDashboard,
  visitEmbeddedPage,
} from "e2e/support/helpers";

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
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database").as("getDatabases");
  });

  it("should cancel the native query via the keyboard shortcut (metabase#11727)", () => {
    withDatabase(PG_DB_ID, () => {
      cy.visit("/question#" + adhocQuestionHash(questionDetails));
      cy.wait("@getDatabases");

      runNativeQuery({ wait: false });
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
    restore();
    cy.signInAsNormalUser();
  });

  it("should pass parameters when running with 'Run select text' (metabase#16584)", () => {
    // The bug described in is #16584 can be further simplified:
    // - the issue persists even when selecting the *entire* query
    // - the issue is unrelated to using a date filter, using a text filter works too
    // - the issue is unrelated to whether or not the parameter is required or if default value is set
    // - the space at the end of the query is not needed to reproduce this issue
    openNativeEditor()
      .type(
        "SELECT COUNTRY FROM ACCOUNTS WHERE COUNTRY = {{ country }} LIMIT 1",
        {
          parseSpecialCharSequences: false,
          delay: 0,
        },
      )
      .type("{selectAll}");

    cy.findByPlaceholderText("Country").type("NL", { delay: 0 });

    runNativeQuery();

    cy.findByTestId("query-visualization-root")
      .findByText("NL")
      .should("exist");
  });
});

describe("issue 37125", () => {
  const QUESTION = {
    name: "Boolean param",
    native: {
      query: "select * from people where 1=1 [[ AND {{ bool }} ]] limit 1",
      "template-tags": {
        bool: {
          id: "a0eebc99-9c0b-4ef8-bb96-6b9bd34d496b",
          type: "text",
          name: "bool",
          "display-name": "Boolean",
          default: "true",
          required: true,
        },
      },
    },
  } as const;

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  function filter(name: string) {
    return cy
      .get("legend")
      .contains(name)
      .parent("fieldset")
      .findByRole("textbox");
  }

  function enableEmbeddingForResource(
    resource: "question" | "dashboard",
    id: number,
  ) {
    const endpoint = resource === "question" ? "card" : "dashboard";
    cy.request("PUT", `/api/${endpoint}/${id}`, {
      enable_embedding: true,
      embedding_params: {
        bool: "enabled",
      },
    });
  }

  function linkFilterToColumn(column: string) {
    cy.findByTestId("dashcard")
      .findByText("Column to filter on")
      .parent()
      .parent()
      .within(() => {
        cy.findByText("Select…").click();
      });
    popover().within(() => {
      cy.findByText(column).click();
    });
  }

  function setParameterLabel(label: string) {
    dashboardParameterSidebar().findByLabelText("Label").clear().type(label);
  }

  function setParameterDefaultValue(value: string) {
    dashboardParameterSidebar().findByPlaceholderText("No default").type(value);
  }

  function addTextFilter() {
    cy.findByLabelText("Add a filter").click();
    popover().findByText("Text or Category").click();
  }

  function createAndConfigureDashboard(): Cypress.Chainable<number> {
    return (
      cy
        // @ts-expect-error: ts does not know about createDashboardWithQuestions
        .createDashboardWithQuestions({
          dashboardDetails: {
            name: "Source dashboard",
          },
          questions: [QUESTION],
        })
        .then(({ dashboard: { id } }: { dashboard: { id: number } }) => {
          visitDashboard(id);
          editDashboard();
          addTextFilter();
          linkFilterToColumn("Boolean");
          setParameterLabel("Bool");
          setParameterDefaultValue("true");
          saveDashboard();

          return cy.wrap(id);
        })
    );
  }

  it("should be possible to create a public native question with a boolean parameter (metabase#37125)", () => {
    createNativeQuestion(QUESTION).then(response => {
      visitPublicQuestion(response.body.id);
    });

    // filter is 'true', data should be found
    filter("Boolean").should("have.value", "true");
    cy.findAllByTestId("table-row").should("have.length", 1);

    // set filter to 'false' and verify that there are no results
    filter("Boolean").clear().type("false").blur();
    cy.findByTestId("visualization-root")
      .findByText("No results!")
      .should("exist");
  });

  it("should be possible to create an embedded question with a boolean parameter (metabase#37125)", () => {
    createNativeQuestion(QUESTION).then(response => {
      enableEmbeddingForResource("question", response.body.id);
      visitEmbeddedPage({
        resource: { question: response.body.id },
        params: {},
      });
    });

    // filter is 'true', data should be found
    filter("Boolean").should("have.value", "true");
    cy.findAllByTestId("table-row").should("have.length", 1);

    // set filter to 'false' and verify that there are no results
    filter("Boolean").clear().type("false").blur();
    cy.findByTestId("visualization-root")
      .findByText("No results!")
      .should("exist");
  });

  it("should be possible to create a public dashboard with a parameter mapped to a boolean parameter (metabase#37125)", () => {
    createAndConfigureDashboard().then(id => visitPublicDashboard(id));

    // filter is 'true', data should be found
    filter("Bool").should("have.value", "true");
    cy.findAllByTestId("table-row").should("have.length", 1);

    // set filter to 'false' and verify that there are no results
    filter("Bool").clear().type("false").blur();
    cy.findByTestId("visualization-root")
      .findByText("No results!")
      .should("exist");
  });

  it("should be possible to create an embedded dashboard with a parameter mapped to a boolean parameter (metabase#37125)", () => {
    createAndConfigureDashboard().then(id => {
      enableEmbeddingForResource("dashboard", id);
      visitEmbeddedPage({
        resource: { dashboard: id },
        params: {},
      });
    });

    // filter is 'true', data should be found
    filter("Bool").should("have.value", "true");
    cy.findAllByTestId("table-row").should("have.length", 1);

    // set filter to 'false' and verify that there are no results
    filter("Bool").clear().type("false").blur();
    cy.findByTestId("visualization-root")
      .findByText("No results!")
      .should("exist");
  });
});
