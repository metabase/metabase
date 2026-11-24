import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import type { NativeQuestionDetails } from "e2e/support/helpers";

const { H } = cy;

describe("monitor > tools > erroring questions", () => {
  const TOOLS_ERRORS_URL = "/monitor/errors";
  // The filter is required but doesn't have a default value set
  const brokenQuestionDetails = {
    name: "Broken SQL",
    native: {
      "template-tags": {
        filter: {
          id: "ce8f111c-24c4-6823-b34f-f704404572f1",
          name: "filter",
          "display-name": "Filter",
          type: "text",
          required: true,
        },
      },
      query: "select {{filter}}",
    },
    display: "scalar",
  };

  function fixQuestion(name: string) {
    // the row opens in a new tab, which Cypress can't follow with a click,
    // so navigating directly
    cy.findByTestId("erroring-questions-table")
      .findByText(name)
      .closest("a")
      .invoke("attr", "href")
      // the row link always carries an href; narrow string | undefined for cy.visit
      .then((href) => cy.visit(href as string));

    cy.findByText("Open Editor").click();

    cy.icon("variable").click();
    cy.findByPlaceholderText("Enter a default value…").type("Foo");

    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.findByText("Save").click();

    H.modal().within(() => {
      cy.button("Save").click();
    });
    cy.wait("@updateCard");
  }

  function selectQuestion(name: string) {
    cy.findByText(name)
      .closest('[data-testid="erroring-question"]')
      .within(() => {
        cy.findByRole("checkbox").click().should("be.checked");
      });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.intercept("POST", "/api/dataset").as("dataset");

    // Unjustified type cast. FIXME
    H.createNativeQuestion(brokenQuestionDetails as NativeQuestionDetails, {
      loadMetadata: true,
    });

    cy.visit(TOOLS_ERRORS_URL);
  });

  it("should rerun, search and clear a broken question", () => {
    cy.wait("@dataset");

    cy.findByRole("heading", { name: "Erroring questions" }).should(
      "be.visible",
    );
    cy.findByTestId("erroring-questions-table")
      .findByText(brokenQuestionDetails.name)
      .should("be.visible");
    // nothing selected -> the bulk action bar (and its button) is hidden
    cy.button("Rerun selected").should("not.exist");
    selectQuestion(brokenQuestionDetails.name);

    cy.intercept("POST", "/api/dataset").as("rerunRefetch");
    cy.button("Rerun selected").should("not.be.disabled").click();

    cy.wait("@rerunRefetch");
    cy.findByTestId("erroring-questions-table").should(
      "have.attr",
      "aria-busy",
      "false",
    );

    // The question is still there because we didn't fix it
    cy.findByTestId("erroring-questions-table")
      .findByText(brokenQuestionDetails.name)
      .should("be.visible");
    // rerunning clears the selection, so the bulk action bar closes
    cy.button("Rerun selected").should("not.exist");

    cy.intercept("POST", "/api/dataset").as("searchRefetch");
    cy.findByPlaceholderText(
      "Search by question, error, database, or collection",
    )
      .should("be.enabled")
      .type("foo");

    cy.wait("@searchRefetch");

    cy.findByTestId("erroring-questions-table")
      .findByText("No results")
      .should("be.visible");

    cy.findByPlaceholderText(
      "Search by question, error, database, or collection",
    ).clear();

    fixQuestion(brokenQuestionDetails.name);

    cy.visit(TOOLS_ERRORS_URL);

    selectQuestion(brokenQuestionDetails.name);

    cy.intercept("POST", "/api/dataset").as("fixedRerunRefetch");
    cy.button("Rerun selected").should("not.be.disabled").click();

    cy.wait("@fixedRerunRefetch");

    cy.findByTestId("erroring-questions-table")
      .findByText("No results")
      .should("be.visible");
  });
});

describe("monitor > tools", () => {
  const TOOLS_ERRORS_URL = "/monitor/errors";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should navigate the Monitor tools with real data", () => {
    cy.log(
      "Enable model persistence in order to have multiple tabs/routes in tools",
    );
    cy.request("POST", "/api/persist/enable");
    cy.visit("/monitor");
    cy.location("pathname").should(
      "match",
      /^\/monitor\/dependency-diagnostics/,
    );

    cy.findByTestId("monitor-nav")
      .findByRole("link", { name: /Erroring questions/ })
      .click();
    cy.location("pathname").should("eq", TOOLS_ERRORS_URL);

    cy.findByRole("heading", {
      name: "Erroring questions",
    }).should("be.visible");

    cy.log("test no results state");
    cy.findByTestId("erroring-questions-table")
      .findByText("No results")
      .should("be.visible");
    cy.findByPlaceholderText(
      "Search by question, error, database, or collection",
    ).should("be.enabled");

    cy.log("We should be able to switch to the model persistence log page");

    cy.findByTestId("monitor-nav").findByText("Model persistence log").click();
    cy.location("pathname").should("eq", "/monitor/model-persistence-log");
    cy.findByTestId("monitor-main")
      .findByRole("heading", { name: "Model persistence log" })
      .should("be.visible");

    cy.log("Background tasks, a task and its runs, with real data");
    cy.intercept({ method: "GET", pathname: "/api/task" }).as("getTasks");
    cy.intercept({ method: "GET", pathname: "/api/task/runs" }).as(
      "getTaskRuns",
    );
    cy.findByTestId("monitor-nav").findByText("Background tasks").click();
    cy.location("pathname").should("eq", "/monitor/tasks/list");
    cy.wait("@getTasks").its("response.statusCode").should("eq", 200);

    cy.findByRole("link", { name: "Runs" }).click();
    cy.location("pathname").should("eq", "/monitor/tasks/runs");
    cy.wait("@getTaskRuns").its("response.statusCode").should("eq", 200);
    cy.findByTestId("task-runs-table").should("be.visible");

    cy.log("A real sync run: open its details, then reload them");
    cy.request("POST", `/api/database/${SAMPLE_DB_ID}/sync_schema`);
    waitForSuccessfulSyncRun();
    cy.intercept({ method: "GET", pathname: "/api/task/runs/*" }).as(
      "getTaskRun",
    );
    cy.visit(`/monitor/tasks/runs?${SAMPLE_DB_SYNC_RUNS_QUERY}`);
    cy.findByTestId("task-runs-table")
      .findAllByTestId("task-run")
      .first()
      .click();
    cy.location("pathname").should("match", /^\/monitor\/tasks\/runs\/\d+$/);
    cy.wait("@getTaskRun").its("response.statusCode").should("eq", 200);
    assertSampleDatabaseSyncRunDetails();

    cy.reload();
    cy.wait("@getTaskRun").its("response.statusCode").should("eq", 200);
    assertSampleDatabaseSyncRunDetails();

    cy.findByRole("link", { name: /Back to Runs/ }).click();
    cy.location("pathname").should("eq", "/monitor/tasks/runs");
    cy.findByRole("link", { name: "Tasks" }).click();
    cy.location("pathname").should("eq", "/monitor/tasks/list");

    cy.log(
      "Back to Tasks should go to the tasks list even with no browser history (metabase#57113)",
    );
    cy.log("Pick an existing task url");
    cy.findAllByTestId("task").should("be.visible").first().click();

    cy.location("pathname")
      .should("match", /\/monitor\/tasks\/list\/[0-9]+$/)
      .then((pathname) => {
        // Clear all history and navigate to the task detail page
        cy.window().then((window) => {
          window.history.replaceState(null, "", pathname);
          // Clear the entire history stack by going to about:blank first
          window.location.href = "about:blank";
        });

        cy.visit(pathname);
        cy.findByTestId("monitor-main")
          .findByText("Task details")
          .should("be.visible");
        cy.findByText("Back to Tasks").click();
        cy.location("pathname").should("eq", "/monitor/tasks/list");
      });

    cy.log("Application logs, with real data");
    cy.intercept({ method: "GET", pathname: "/api/logger/logs" }).as("getLogs");
    cy.findByTestId("monitor-nav").findByText("Application logs").click();
    cy.location("pathname").should("eq", "/monitor/logs");
    cy.wait("@getLogs").its("response.statusCode").should("eq", 200);
    cy.findByLabelText("Logs output").should("be.visible");
    cy.button(/Download/)
      .should("be.enabled")
      .click();
    // every log line starts with its ISO timestamp
    cy.readFile("cypress/downloads/logs.txt").should(
      "match",
      /^\S*\s?\d{4}-\d{2}-\d{2}T/,
    );
  });
});

const SAMPLE_DB_SYNC_RUNS_QUERY = new URLSearchParams({
  "run-type": "sync",
  "started-at": "thisday",
  "entity-type": "database",
  "entity-id": String(SAMPLE_DB_ID),
  status: "success",
}).toString();

function waitForSuccessfulSyncRun(attempt = 0) {
  const MAX_ATTEMPTS = 30;
  cy.request(`/api/task/runs?${SAMPLE_DB_SYNC_RUNS_QUERY}`).then(
    ({ body }: Cypress.Response<{ total: number }>) => {
      if (body.total > 0) {
        return;
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error("The Sample Database sync run did not finish");
      }
      cy.wait(1000);
      waitForSuccessfulSyncRun(attempt + 1);
    },
  );
}

function assertSampleDatabaseSyncRunDetails() {
  cy.findByTestId("monitor-main").within(() => {
    cy.findByText("Run type").should("be.visible");
    cy.findByText("Sync").should("be.visible");
    cy.findByRole("link", { name: "Sample Database" })
      .should("be.visible")
      .and("have.attr", "href", `/admin/databases/${SAMPLE_DB_ID}`);
  });
  cy.findByTestId("task-run-tasks-table")
    .findAllByTestId("task-run-task")
    .should("have.length.at.least", 1);
}
