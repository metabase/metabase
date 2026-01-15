import dayjs from "dayjs";

import type { NativeQuestionDetails } from "e2e/support/helpers";
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

  it("pagination should work (metabase#14636)", () => {
    cy.visit("/admin/tools/tasks/list");
    cy.wait("@first");

    cy.location("search").should("eq", "");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Troubleshooting logs");

    cy.findByLabelText("pagination").findByText("1 - 50").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("field values scanning");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("513");

    cy.findByLabelText("Previous page").should("be.disabled");
    cy.findByLabelText("Next page").should("not.be.disabled").click();
    cy.wait("@second");

    cy.location("search").should("eq", "?page=1");

    cy.findByLabelText("pagination")
      .findByText(`51 - ${total}`)
      .should("be.visible");
    cy.findByLabelText("pagination").findByText("1 - 50").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("analyze");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("200");

    cy.findByLabelText("Next page").should("be.disabled");
    cy.findByLabelText("Previous page").should("not.be.disabled").click();

    cy.location("search").should("eq", "");

    cy.log("pagination should affect browser history");
    cy.go("back");
    cy.location("pathname").should("eq", "/admin/tools/tasks/list");
    cy.location("search").should("eq", "?page=1");
    cy.go("back");
    cy.location("pathname").should("eq", "/admin/tools/tasks/list");
    cy.location("search").should("eq", "");

    cy.log("it should respect page query param on page load");
    cy.visit("/admin/tools/tasks/list?page=1");
    cy.wait("@second");

    cy.findByLabelText("pagination")
      .findByText(`51 - ${total}`)
      .should("be.visible");
  });

  it("filtering should work", () => {
    cy.visit(
      "/admin/tools/tasks/list?status=success&task=field+values+scanning",
    );

    cy.findByPlaceholderText("Filter by task").should(
      "have.value",
      "field values scanning",
    );
    cy.findByPlaceholderText("Filter by status").should(
      "have.value",
      "Success",
    );
    cy.findAllByTestId("task").should("have.length", 1);
    cy.findByTestId("task")
      .should("contain.text", "field values scanning")
      .and("contain.text", "Sample Database")
      .and("contain.text", "Success");

    cy.findByPlaceholderText("Filter by status").click();
    H.popover().findByText("Failed").click();
    cy.location("search").should(
      "eq",
      "?status=failed&task=field+values+scanning",
    );
    cy.findAllByTestId("task").should("have.length", 0);
    cy.findByTestId("admin-layout-content").should(
      "contain.text",
      "No results",
    );

    cy.findByPlaceholderText("Filter by status")
      .parent()
      .findByLabelText("Clear")
      .click();
    cy.location("search").should("eq", "?task=field+values+scanning");
    cy.findByPlaceholderText("Filter by status").should("have.value", "");
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
    cy.wait("@first");
    cy.findAllByTestId("task").should("have.length", 50);
    cy.findByLabelText("pagination").findByText("1 - 50").should("be.visible");

    cy.log("should reset pagination when changing filters");
    cy.visit("/admin/tools/tasks/list?page=1");
    cy.findByPlaceholderText("Filter by status").click();
    H.popover().findByText("Success").click();
    cy.location("search").should("eq", "?status=success");

    cy.log("should remove invalid query params");
    cy.visit("/admin/tools/tasks/list?status=foobar");
    cy.location("search").should("eq", "");
    cy.findByPlaceholderText("Filter by status").should("have.value", "");
  });
});

describe("scenarios > admin > tools > tasks", () => {
  const task = createMockTask({
    task_details: {
      useful: {
        information: true,
      },
    },
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

  it("shows task details page", () => {
    cy.visit("/admin/tools/tasks/list");
    cy.wait("@getTasks");

    cy.findByTestId("tasks-table").findByText("A task").click();
    cy.wait("@getTask");
    cy.location("pathname").should("eq", `/admin/tools/tasks/list/${task.id}`);

    cy.log("task details");
    cy.get(".cm-content").should("be.visible").get(".cm-line").as("lines");
    cy.get("@lines").eq(0).should("have.text", "{");
    cy.get("@lines").eq(1).should("have.text", '  "useful": {');
    cy.get("@lines").eq(2).should("have.text", '    "information": true');
    cy.get("@lines").eq(3).should("have.text", "  }");
    cy.get("@lines").eq(4).should("have.text", "}");

    cy.log("copy button");
    cy.window().then((window) => {
      cy.stub(window.navigator.clipboard, "writeText").resolves();
    });
    cy.icon("copy").click();
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
  });
});

describe("scenarios > admin > tools > logs", () => {
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
    timestamp: "2024-01-10T21:21:58.598Z",
    level: "ERROR",
  };

  beforeEach(() => {
    cy.intercept("GET", "/api/logger/logs", (request) => {
      request.reply([log1, log2]);
    }).as("getLogs");

    H.restore();
    cy.signInAsAdmin();

    cy.visit("/admin/tools/logs");
    cy.wait("@getLogs");
  });

  it("should allow to download logs", () => {
    cy.button(/Download/).click();
    cy.readFile("cypress/downloads/logs.txt").should(
      "equal",
      [
        `[e7774ef2-42ab-43de-89f7-d6de9fdc624f] ${formatTimestamp(log1.timestamp)} DEBUG metabase.server.middleware.log message`,
        `[e7774ef2-42ab-43de-89f7-d6de9fdc624f] ${formatTimestamp(log2.timestamp)} ERROR metabase.server.middleware.log message`,
      ].join("\n"),
    );
  });

  it("should allow to download filtered logs", () => {
    cy.findByPlaceholderText("Filter logs").type("error");
    cy.button(/Download/).click();
    cy.readFile("cypress/downloads/logs.txt").should(
      "equal",
      `[e7774ef2-42ab-43de-89f7-d6de9fdc624f] ${formatTimestamp(log2.timestamp)} ERROR metabase.server.middleware.log message`,
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

describe("admin > tools > erroring questions ", () => {
  const TOOLS_ERRORS_URL = "/admin/tools/errors";
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
    cy.findByTestId("visualization-root").findByText(name).click();

    cy.findByText("Open Editor").click();

    cy.icon("variable").click();
    cy.findByPlaceholderText("Enter a default value…").type("Foo");

    cy.findByText("Save").click();

    H.modal().within(() => {
      cy.button("Save").click();
    });
  }

  function selectQuestion(name: string) {
    cy.findByText(name)
      .closest("tr")
      .within(() => {
        cy.findByRole("checkbox").click().should("be.checked");
      });
  }

  describe("when feature enabled", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");

      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    describe("without broken questions", () => {
      it('should render the "Tools" tab and navigate to the "Erroring Questions" by clicking on it', () => {
        // The sidebar has been taken out, because it looks awkward when there's only one elem on it: put it back in when there's more than one
        cy.visit("/admin");

        cy.get("nav").contains("Tools").click();

        cy.findByRole("link", { name: /Erroring questions/ }).click();
        cy.location("pathname").should("eq", TOOLS_ERRORS_URL);

        cy.log("test no results state");

        cy.findByTestId("visualization-root").findByText("No results");
        cy.button("Rerun Selected").should("be.disabled");
        cy.findByPlaceholderText("Error contents").should("be.disabled");
        cy.findByPlaceholderText("DB name").should("be.disabled");
        cy.findByPlaceholderText("Collection name").should("be.disabled");
      });
    });

    describe("with the existing broken questions", () => {
      beforeEach(() => {
        H.createNativeQuestion(brokenQuestionDetails as NativeQuestionDetails, {
          loadMetadata: true,
        });

        cy.visit(TOOLS_ERRORS_URL);
      });

      it("should render correctly", () => {
        cy.wait("@dataset");

        selectQuestion(brokenQuestionDetails.name);

        cy.button("Rerun Selected").should("not.be.disabled").click();

        cy.wait("@dataset");

        // The question is still there because we didn't fix it
        cy.findByTestId("visualization-root").findByText(
          brokenQuestionDetails.name,
        );
        cy.button("Rerun Selected").should("be.disabled");

        cy.findByPlaceholderText("Error contents").should("not.be.disabled");
        cy.findByPlaceholderText("DB name").should("not.be.disabled");
        cy.findByPlaceholderText("Collection name")
          .should("not.be.disabled")
          .type("foo");

        cy.wait("@dataset");

        cy.findByTestId("visualization-root").findByText("No results");

        cy.findByPlaceholderText("Collection name").clear();

        fixQuestion(brokenQuestionDetails.name);

        cy.visit(TOOLS_ERRORS_URL);

        selectQuestion(brokenQuestionDetails.name);

        cy.button("Rerun Selected").should("not.be.disabled").click();

        cy.wait("@dataset");

        cy.findByTestId("visualization-root").findByText("No results");
      });
    });
  });
});

describe("admin > tools", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should show either the erroring questions or the upsell (based on the `audit_app` feature flag)", () => {
    cy.log(
      "Enable model persistence in order to have multiple tabs/routes in tools",
    );
    cy.request("POST", "/api/persist/enable");
    cy.visit("/admin/tools/errors");

    cy.findByRole("heading", {
      name: "Questions that errored when last run",
    }).should("be.visible");

    cy.log("We should be able to switch to the model caching page");

    cy.findByTestId("admin-layout-sidebar")
      .findByText("Model cache log")
      .click();
    cy.location("pathname").should("eq", "/admin/tools/model-caching");

    cy.log(
      "Once the audit_app feature flag is gone, tools should display an upsell",
    );
    H.deleteToken();
    cy.visit("/admin/tools/errors");

    cy.findByRole("heading", {
      name: "Troubleshoot faster",
    }).should("be.visible");
    cy.findByRole("button", { name: "Try for free" });
  });

  describe("issue 57113", () => {
    it("should navigate to /admin/tools/tasks/list when clicking Back to Tasks even with no browser history", () => {
      cy.visit("/admin/tools/tasks/list");

      cy.log("Pick an existing task url");

      cy.findAllByTestId("task").should("be.visible").first().click();

      cy.location("pathname")
        .should("match", /\/admin\/tools\/tasks\/list\/[0-9]+$/)
        .then((pathname) => {
          // Clear all history and navigate to the task detail page
          cy.window().then((window) => {
            window.history.replaceState(null, "", pathname);
            // Clear the entire history stack by going to about:blank first
            window.location.href = "about:blank";
          });

          cy.visit(pathname);
          cy.findByText("Back to Tasks").click();
          cy.location("pathname").should("eq", "/admin/tools/tasks/list");
        });
    });
  });
});
