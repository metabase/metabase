import type { NativeQuestionDetails } from "e2e/support/helpers";
import { dayjs } from "metabase/dayjs";
import { createMockTask } from "metabase-types/api/mocks";

const { H } = cy;

describe("issue 14636", () => {
  const total = 57;
  const limit = 50;

  /**
   * @param {Object} payload
   * @param {(0|1)} payload.page
   * @param {("first"|"second")} payload.alias
   */
  function stubPageResponses({ page, alias }: { page: number; alias: string }) {
    const offset = page * limit;

    cy.intercept(
      "GET",
      `/api/task?limit=${limit}&offset=${offset}&sort_column=started_at&sort_direction=desc`,
      {
        status: 200,
        body: {
          data: stubPageRows(page),
          limit,
          offset,
          total,
        },
      },
    ).as(alias);
  }

  function stubFilteredResponse({
    status,
    task,
    data,
    alias,
  }: {
    status?: string;
    task?: string;
    data: ReturnType<typeof createMockTask>[];
    alias: string;
  }) {
    cy.intercept(
      {
        method: "GET",
        pathname: "/api/task",
        query: {
          limit: String(limit),
          offset: "0",
          sort_column: "started_at",
          sort_direction: "desc",
          ...(status ? { status } : {}),
          ...(task ? { task } : {}),
        },
      },
      {
        statusCode: 200,
        body: {
          data,
          limit,
          offset: 0,
          total: data.length,
        },
      },
    ).as(alias);
  }

  /**
   * @typedef {Object} Row
   *
   * @param {(0|1)} page
   * @returns Row[]
   */
  function stubPageRows(page: number) {
    // There rows details don't really matter.
    // We're generating two types of rows. One for each page.
    const tasks = ["field values scanning", "analyze"];
    const durations = [513, 200];

    /** type: {Row} */
    const row = {
      id: 1,
      task: tasks[page],
      db_id: 1,
      started_at: "2023-03-04T01:45:26.005475-08:00",
      ended_at: "2023-03-04T01:45:26.518597-08:00",
      duration: durations[page],
      task_details: null,
      name: "Item $page}",
      model: "card",
      status: "success",
    };

    const pageRows = [limit, total - limit];
    const length = pageRows[page];

    return Array.from({ length }, (_, index) => ({
      ...row,
      id: index + 1,
    }));
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // The only reliable way to reproduce this issue is by stubing page responses!
    // All previous attempts to generate enough real tasks (more than 50)
    // resulted in flaky and unpredictable tests.
    stubPageResponses({ page: 0, alias: "first" });
    stubPageResponses({ page: 1, alias: "second" });
  });

  it("pagination and filtering should work (metabase#14636)", () => {
    cy.visit("/monitor/tasks/list");
    cy.wait("@first");

    cy.location("search").should("eq", "");

    cy.findByRole("heading", { name: "Background tasks" }).should("be.visible");

    cy.findByLabelText("pagination").findByText("1 - 50").should("be.visible");
    cy.findByTestId("tasks-table")
      .should("contain.text", "field values scanning")
      .and("contain.text", "513");

    cy.findByLabelText("Previous page").should("be.disabled");
    cy.findByLabelText("Next page").should("not.be.disabled").click();
    cy.wait("@second");

    cy.location("search").should("eq", "?page=1");

    cy.findByLabelText("pagination")
      .findByText(`51 - ${total}`)
      .should("be.visible");
    cy.findByLabelText("pagination").findByText("1 - 50").should("not.exist");
    cy.findByTestId("tasks-table")
      .should("contain.text", "analyze")
      .and("contain.text", "200")
      .and("not.contain.text", "field values scanning");

    cy.findByLabelText("Next page").should("be.disabled");
    cy.findByLabelText("Previous page").should("not.be.disabled").click();

    cy.location("search").should("eq", "");
    cy.findByLabelText("pagination").findByText("1 - 50").should("be.visible");
    cy.findByTestId("tasks-table").should(
      "contain.text",
      "field values scanning",
    );

    cy.log("pagination should affect browser history");
    cy.go("back");
    cy.location("pathname").should("eq", "/monitor/tasks/list");
    cy.location("search").should("eq", "?page=1");
    cy.go("back");
    cy.location("pathname").should("eq", "/monitor/tasks/list");
    cy.location("search").should("eq", "");

    cy.log("filtering");
    const task = "field values scanning";
    const filteredTask = createMockTask({ task });

    stubPageResponses({ page: 0, alias: "unfilteredFirst" });
    stubPageResponses({ page: 1, alias: "unfilteredSecond" });
    // Keep this test independent of background tasks created asynchronously by H.restore().
    // Register the less-specific routes first because Cypress matches intercepts in reverse order.
    stubFilteredResponse({
      status: "success",
      data: [filteredTask],
      alias: "successfulTasks",
    });
    stubFilteredResponse({
      task,
      data: [filteredTask],
      alias: "filteredTasks",
    });
    stubFilteredResponse({
      status: "failed",
      task,
      data: [],
      alias: "failedFilteredTasks",
    });
    stubFilteredResponse({
      status: "success",
      task,
      data: [filteredTask],
      alias: "successfulFilteredTasks",
    });

    cy.visit("/monitor/tasks/list?status=success&task=field+values+scanning");
    cy.wait("@successfulFilteredTasks");

    cy.findByPlaceholderText("Filter by task").should("have.value", task);
    getFilterByStatus().should("have.value", "Success");
    cy.findAllByTestId("task").should("have.length", 1);
    cy.findByTestId("task")
      .should("contain.text", "field values scanning")
      .and("contain.text", "Sample Database")
      .and("contain.text", "Success");

    getFilterByStatus().click();
    H.popover().findByText("Failed").click();
    cy.wait("@failedFilteredTasks");
    cy.location("search").should(
      "eq",
      "?status=failed&task=field+values+scanning",
    );
    cy.findAllByTestId("task").should("have.length", 0);
    cy.findByTestId("monitor-main").should("contain.text", "No results");

    getFilterByStatus().parent().findByLabelText("Clear").click();
    cy.wait("@filteredTasks");
    cy.location("search").should("eq", "?task=field+values+scanning");
    getFilterByStatus().should("have.value", "");
    cy.findAllByTestId("task").should("have.length", 1);
    cy.findByTestId("task")
      .should("contain.text", "field values scanning")
      .and("contain.text", "Sample Database")
      .and("contain.text", "Success");

    cy.findByPlaceholderText("Filter by task")
      .parent()
      .findByLabelText("Clear")
      .click();
    cy.location("search").should("eq", "");
    cy.wait("@unfilteredFirst");
    cy.findByLabelText("pagination").findByText("1 - 50").should("be.visible");

    cy.log("it should respect page query param on page load");
    cy.visit("/monitor/tasks/list?page=1");
    cy.wait("@unfilteredSecond");
    cy.findByLabelText("pagination")
      .findByText(`51 - ${total}`)
      .should("be.visible");

    cy.log("should reset pagination when changing filters");
    getFilterByStatus().click();
    H.popover().findByText("Success").click();
    cy.wait("@successfulTasks");
    cy.location("search").should("eq", "?status=success");

    cy.log("should remove invalid query params");
    cy.visit("/monitor/tasks/list?status=foobar");
    cy.wait("@unfilteredFirst");
    cy.location("search").should("eq", "");
    getFilterByStatus().should("have.value", "");
  });
});

describe("scenarios > monitor > tools > tasks", () => {
  const task = createMockTask({
    task_details: {
      useful: {
        information: true,
      },
    },
    logs: [],
  });

  const formattedTaskJson = JSON.stringify(task.task_details, null, 2);

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // The only reliable way of having a consistent list of tasks is mocking them
    cy.intercept("GET", "/api/task?*", (request) => {
      request.reply((response) => {
        response.body.data = [task];
      });
    }).as("getTasks");

    cy.intercept("GET", `/api/task/${task.id}`, (request) => {
      request.reply((response) => {
        response.body = task;
      });
    }).as("getTask");
  });

  it("shows task details page with and without logs", () => {
    cy.visit("/monitor/tasks/list");
    cy.wait("@getTasks");

    cy.findByTestId("tasks-table").findByText("A task").click();
    cy.wait("@getTask");
    cy.location("pathname").should("eq", `/monitor/tasks/list/${task.id}`);

    cy.log("task details");
    cy.get(".cm-content").should("be.visible").get(".cm-line").as("lines");
    cy.get("@lines").eq(0).should("have.text", "{");
    cy.get("@lines").eq(1).should("have.text", '  "useful": {');
    cy.get("@lines").eq(2).should("have.text", '    "information": true');
    cy.get("@lines").eq(3).should("have.text", "  }");
    cy.get("@lines").eq(4).should("have.text", "}");

    cy.log("empty logs");
    cy.findByTestId("monitor-main")
      .findByText("There are no captured logs")
      .should("be.visible");
    cy.findByTestId("task-logs").should("not.exist");

    cy.log("copy button");
    cy.window().then((window) => {
      cy.stub(window.navigator.clipboard, "writeText").resolves();
    });
    cy.findByTestId("code-container").icon("copy").click();
    cy.window()
      .its("navigator.clipboard.writeText")
      .should("be.calledWith", formattedTaskJson);
    cy.findByRole("tooltip").should("have.text", "Copied!");

    cy.log("download button");
    cy.button(/Download/).click();
    cy.readFile(`cypress/downloads/task-${task.id}.json`).should(
      "deep.equal",
      // Ideally, we would compare raw strings here, but Cypress automatically parses JSON files
      task.task_details,
    );

    cy.log("logs");
    const taskWithLogs = {
      ...task,
      logs: [
        {
          timestamp: "2024-01-10T10:00:00.000Z",
          process_uuid: "test-uuid-1234",
          fqns: "metabase.sync.sync",
          msg: "Starting database sync",
          level: "INFO",
          exception: null,
        },
        {
          timestamp: "2024-01-10T10:00:01.000Z",
          process_uuid: "test-uuid-1234",
          fqns: "metabase.sync.sync",
          msg: "Sync completed successfully",
          level: "DEBUG",
          exception: null,
        },
      ],
    };

    cy.intercept("GET", `/api/task/${task.id}`, {
      body: taskWithLogs,
    }).as("getTaskWithLogs");

    cy.reload();
    cy.wait("@getTaskWithLogs");

    cy.findByTestId("task-logs").scrollIntoView().should("be.visible");
    cy.findByTestId("task-logs").within(() => {
      cy.findByText(new RegExp(taskWithLogs.logs[0].msg)).should("be.visible");
      cy.findByText(new RegExp(taskWithLogs.logs[1].msg)).should("be.visible");
    });
    cy.findByTestId("monitor-main")
      .findByText("There are no captured logs")
      .should("not.exist");
  });
});

describe("scenarios > monitor > tools > logs", () => {
  const log1 = {
    timestamp: "2024-01-10T21:21:58.597Z",
    level: "DEBUG",
    fqns: "metabase.server.middleware.log",
    msg: "message",
    exception: null,
    process_uuid: "e7774ef2-42ab-43de-89f7-d6de9fdc624f",
  };
  const log2 = {
    ...log1,
    process_uuid: "9da436dc-d79c-42f9-89e3-322c22cd0cd3",
    timestamp: "2024-01-10T21:21:58.598Z",
    level: "ERROR",
  };

  beforeEach(() => {
    cy.intercept("GET", "/api/logger/logs", (request) => {
      request.reply([log1, log2]);
    }).as("getLogs");

    H.restore();
    cy.signInAsAdmin();

    cy.visit("/monitor/logs");
    cy.wait("@getLogs");
  });

  it("should allow to download all logs and filtered logs", () => {
    cy.button(/Download/).click();
    cy.readFile("cypress/downloads/logs.txt").should(
      "equal",
      [
        `[e7774ef2-42ab-43de-89f7-d6de9fdc624f] ${formatTimestamp(log1.timestamp)} DEBUG metabase.server.middleware.log message`,
        `[9da436dc-d79c-42f9-89e3-322c22cd0cd3] ${formatTimestamp(log2.timestamp)} ERROR metabase.server.middleware.log message`,
      ].join("\n"),
    );

    cy.deleteDownloadsFolder();
    cy.findByPlaceholderText("Filter logs").type("error");
    cy.button(/Download/).click();
    cy.readFile("cypress/downloads/logs.txt").should(
      "equal",
      `[9da436dc-d79c-42f9-89e3-322c22cd0cd3] ${formatTimestamp(log2.timestamp)} ERROR metabase.server.middleware.log message`,
    );
  });

  /**
   * The formatted timestamp may vary depending on the timezone in which the test is run.
   * This function makes test assertions timezone-agnostic.
   */
  function formatTimestamp(timestamp: string) {
    return dayjs(timestamp).format();
  }
});

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

  it("should navigate the Monitor tools and show the upsell without the `audit_app` feature flag", () => {
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

    cy.log(
      "Back to Tasks should go to the tasks list even with no browser history (metabase#57113)",
    );
    cy.visit("/monitor/tasks/list");

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
        cy.findByText("Back to Tasks").click();
        cy.location("pathname").should("eq", "/monitor/tasks/list");
      });

    cy.log(
      "Once the audit_app feature flag is gone, tools should display an upsell",
    );
    H.deleteToken();
    cy.visit(TOOLS_ERRORS_URL);

    cy.findByRole("heading", {
      name: "Troubleshoot faster",
    }).should("be.visible");
    cy.findByTestId("erroring-questions-table").should("not.exist");
    cy.findByRole("link", { name: "Upgrade to Pro" }).should("be.visible");
  });
});

describe("scenarios > monitor > tools > task runs", () => {
  const taskRun = {
    id: 1,
    run_type: "sync",
    entity_type: "database",
    entity_id: 1,
    entity_name: "Sample Database",
    started_at: "2024-01-10T10:00:00Z",
    ended_at: "2024-01-10T10:05:00Z",
    status: "success",
    task_count: 3,
    success_count: 2,
    failed_count: 1,
  };

  const taskRunExtended = {
    ...taskRun,
    tasks: [
      {
        id: 101,
        task: "sync-database",
        status: "success",
        db_id: 1,
        duration: 100,
        started_at: "2024-01-10T10:00:00Z",
        ended_at: "2024-01-10T10:01:00Z",
        task_details: null,
        logs: null,
        run_id: 1,
      },
      {
        id: 102,
        task: "analyze",
        status: "success",
        db_id: 1,
        duration: 200,
        started_at: "2024-01-10T10:01:00Z",
        ended_at: "2024-01-10T10:03:00Z",
        task_details: null,
        logs: null,
        run_id: 1,
      },
      {
        id: 103,
        task: "fingerprint",
        status: "failed",
        db_id: 1,
        duration: 50,
        started_at: "2024-01-10T10:03:00Z",
        ended_at: "2024-01-10T10:05:00Z",
        task_details: null,
        logs: null,
        run_id: 1,
      },
    ],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/task/runs?*", (request) => {
      request.reply((response) => {
        response.body = {
          data: [taskRun],
          total: 1,
          limit: 50,
          offset: 0,
        };
      });
    }).as("getTaskRuns");

    cy.intercept("GET", /\/api\/task\/runs\/\d+$/, {
      body: taskRunExtended,
    }).as("getTaskRun");
  });

  it("should switch tabs, open task run details and follow their links", () => {
    cy.visit("/monitor/tasks/list");

    cy.findByTestId("tasks-table")
      .findAllByTestId("task")
      .should("have.length.at.least", 1);

    cy.findByRole("link", { name: "Runs" }).click();
    cy.location("pathname").should("eq", "/monitor/tasks/runs");
    cy.wait("@getTaskRuns");

    cy.findByTestId("task-runs-table")
      .findAllByTestId("task-run")
      .should("have.length.at.least", 1)
      .first()
      .click();
    cy.wait("@getTaskRun");

    cy.location("pathname").should("eq", `/monitor/tasks/runs/${taskRun.id}`);

    cy.findByTestId("monitor-main").within(() => {
      cy.findByText("Run type").should("be.visible");
      cy.findByText("Sync").should("be.visible");
      cy.findByText("Entity").should("be.visible");
      cy.findByText("Sample Database").should("be.visible");
    });

    cy.findByTestId("task-run-tasks-table").should("be.visible");
    cy.findAllByTestId("task-run-task").should("have.length", 3);

    cy.log("associated task row opens the task details");
    cy.findByTestId("task-run-tasks-table")
      .findAllByTestId("task-run-task")
      .first()
      .click();
    cy.location("pathname").should(
      "eq",
      `/monitor/tasks/list/${taskRunExtended.tasks[0].id}`,
    );

    cy.go("back");
    cy.location("pathname").should("eq", `/monitor/tasks/runs/${taskRun.id}`);

    cy.log("entity link opens the database");
    cy.findByRole("link", { name: /Sample Database/i }).click();
    cy.location("pathname").should("eq", "/admin/databases/1");

    cy.go("back");
    cy.location("pathname").should("eq", `/monitor/tasks/runs/${taskRun.id}`);

    cy.log("cold load of the run details page fetches the run");
    cy.reload();
    cy.wait("@getTaskRun");
    cy.findByTestId("monitor-main")
      .findByText("Sample Database")
      .should("be.visible");
    cy.findByTestId("task-run-tasks-table")
      .findAllByTestId("task-run-task")
      .should("have.length", 3);

    cy.log("Back to Runs opens the runs list");
    cy.findByRole("link", { name: /Back to Runs/i }).click();
    cy.location("pathname").should("eq", "/monitor/tasks/runs");

    cy.log("Tasks tab opens the tasks list");
    cy.findByRole("link", { name: "Tasks" }).click();
    cy.location("pathname").should("eq", "/monitor/tasks/list");
    cy.findByTestId("tasks-table")
      .findAllByTestId("task")
      .should("have.length.at.least", 1);
  });
});

describe("scenarios > monitor > tools > task runs pagination", () => {
  const total = 57;
  const limit = 50;

  function stubRunsPageResponses({
    page,
    alias,
  }: {
    page: number;
    alias: string;
  }) {
    const offset = page * limit;

    cy.intercept("GET", `/api/task/runs?limit=${limit}&offset=${offset}*`, {
      status: 200,
      body: {
        data: stubRunsPageRows(page),
        limit,
        offset,
        total,
      },
    }).as(alias);
  }

  function stubRunsPageRows(page: number) {
    const runTypes = ["sync", "fingerprint"];

    const row = {
      id: 1,
      run_type: runTypes[page],
      entity_type: "database",
      entity_id: 1,
      entity_name: "Sample Database",
      started_at: "2024-01-10T10:00:00Z",
      ended_at: "2024-01-10T10:05:00Z",
      status: "success",
      task_count: 3,
      success_count: 2,
      failed_count: 1,
    };

    const pageRows = [limit, total - limit];
    const length = pageRows[page];

    return Array.from({ length }, (_, index) => ({
      ...row,
      id: index + 1,
    }));
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    stubRunsPageResponses({ page: 0, alias: "firstRunsPage" });
    stubRunsPageResponses({ page: 1, alias: "secondRunsPage" });
  });

  it("pagination should work for task runs", () => {
    cy.visit("/monitor/tasks/runs");
    cy.wait("@firstRunsPage");

    cy.location("search").should("eq", "");

    cy.findByLabelText("pagination").findByText("1 - 50").should("be.visible");
    cy.findByTestId("task-runs-table").should("contain.text", "Sync");

    cy.findByLabelText("Previous page").should("be.disabled");
    cy.findByLabelText("Next page").should("not.be.disabled").click();
    cy.wait("@secondRunsPage");

    cy.location("search").should("eq", "?page=1");

    cy.findByLabelText("pagination")
      .scrollIntoView()
      .findByText(`51 - ${total}`)
      .should("be.visible");
    cy.findByTestId("task-runs-table").should("contain.text", "Fingerprint");

    cy.findByLabelText("Next page").should("be.disabled");
    cy.findByLabelText("Previous page").should("not.be.disabled").click();

    cy.location("search").should("eq", "");
    cy.findByLabelText("pagination").findByText("1 - 50").should("be.visible");
    cy.findByTestId("task-runs-table").should("contain.text", "Sync");
  });
});

describe("scenarios > monitor > tools > task runs filtering", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept({ method: "GET", pathname: "/api/task/runs" }, (request) => {
      request.reply((response) => {
        response.body = {
          data: [],
          total: 0,
          limit: 50,
          offset: 0,
        };
      });
    }).as("getTaskRuns");
  });

  it("filtering and the entity picker should work for task runs", () => {
    cy.visit("/monitor/tasks/runs");
    cy.wait("@getTaskRuns");
    cy.intercept("GET", "/api/task/runs/entities?*", {
      body: [
        {
          entity_type: "database",
          entity_id: 1,
          entity_name: "Sample Database",
        },
      ],
      delay: 500,
    }).as("getEntitiesDelayed");

    cy.log("Should be disabled when no run type is selected");
    getFilterByEntity().should("be.disabled");
    assertFilterByEntityTooltipText("Select a run type first");

    cy.log("Filter by run type");
    getFilterByRun().click();
    H.popover().findByText("Sync").click();
    cy.location("search").should("contain", "run-type=sync");
    cy.wait("@getTaskRuns")
      .its("request.url")
      .should("contain", "run-type=sync");

    cy.log("Should be still disabled until started at is selected");
    getFilterByEntity().should("be.disabled");

    cy.log("Should show tooltip 'Select a start time' when hovering");
    assertFilterByEntityTooltipText("Select a start time first");

    cy.log("Filter by started at");
    selectStartedAt("Previous 30 days");

    cy.log("Should show loader while loading entities");
    getFilterByEntity()
      .should("be.disabled")
      .closest(".mb-mantine-Select-root")
      .find(".mb-mantine-Loader-root")
      .should("exist");

    cy.location("search").should("contain", "started-at=past30days");
    cy.wait("@getTaskRuns")
      .its("request.url")
      .should("contain", "started-at=past30days");
    cy.wait("@getEntitiesDelayed");

    cy.log("Filter by entity, enabled after entities are loaded");
    getFilterByEntity().should("not.be.disabled").click();
    H.popover().findByText("Sample Database").click();
    getFilterByEntity().should("have.value", "Sample Database");
    cy.location("search").should("contain", "entity-type=database");
    cy.location("search").should("contain", "entity-id=1");
    cy.wait("@getTaskRuns")
      .its("request.url")
      .should("contain", "entity-type=database")
      .and("contain", "entity-id=1");

    cy.log("Filter by status");
    getFilterByStatus().click();
    H.popover().findByText("Success").click();
    cy.location("search").should("contain", "status=success");
    cy.wait("@getTaskRuns")
      .its("request.url")
      .should("contain", "status=success");

    cy.log("Should clear and disable entity filter when run type is cleared");
    getFilterByRun().parent().findByLabelText("Clear").click();

    getFilterByEntity().should("be.disabled");
    getFilterByEntity().should("have.value", "");
    cy.location("search")
      .should("not.contain", "run-type")
      .and("not.contain", "entity-id");

    cy.log("Should clear and disable entity filter when started at is cleared");
    getFilterByRun().click();
    H.popover().findByText("Sync").click();
    getFilterByEntity().should("not.be.disabled").click();
    H.popover().findByText("Sample Database").click();
    getFilterByEntity().should("have.value", "Sample Database");
    getFilterByStartedAt().parent().findByLabelText("Clear").click();

    getFilterByEntity().should("be.disabled");
    getFilterByEntity().should("have.value", "");

    cy.log("Should show tooltip 'No entities available' when no entities");
    cy.intercept("GET", "/api/task/runs/entities?*", {
      body: [],
    }).as("getEmptyEntities");

    getFilterByRun().click();
    H.popover().findByText("Alert").click();
    selectStartedAt("Previous 30 days");
    cy.wait("@getEmptyEntities");

    getFilterByEntity().should("be.disabled");
    assertFilterByEntityTooltipText("No entities available");

    cy.log("Clear all filters");
    getFilterByRun().parent().findByLabelText("Clear").click();
    getFilterByStartedAt().parent().findByLabelText("Clear").click();
    getFilterByStatus().parent().findByLabelText("Clear").click();
    cy.location("search").should("eq", "");
  });
});

function getFilterByRun() {
  return cy.findByPlaceholderText("Filter by run type");
}
function getFilterByStartedAt() {
  return cy.findByTestId("task-run-date-picker");
}

function selectStartedAt(label: string) {
  getFilterByStartedAt().click();
  H.popover().findByPlaceholderText("Started at").click();
  H.popover().findByRole("option", { name: label }).click();
  getFilterByStartedAt().click();
}

function getFilterByEntity() {
  return cy.findByPlaceholderText("Filter by entity");
}

function getFilterByStatus() {
  return cy.findByPlaceholderText("Filter by status");
}

function assertFilterByEntityTooltipText(text: string) {
  getFilterByEntity().trigger("mouseenter", {
    force: true,
  });
  cy.findByRole("tooltip").should("have.text", text);
}
