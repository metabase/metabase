/**
 * Playwright port of e2e/test/scenarios/admin/tools/tools.cy.spec.ts
 *
 * Porting notes:
 * - cy.intercept stubs → page.route. The task/task-run *list* intercepts in the
 *   original are glob strings whose `?` matches the literal `?` and whose rest
 *   is exact (no `*`), so they match ONLY the fully-unfiltered request; the
 *   filtered requests fall through to the real backend. The predicates below
 *   reproduce that (exact limit/offset/sort, and NO filter params) so the
 *   filtering tests still hit real data, as upstream did.
 * - The /api/task?* and /api/task/runs?* passthrough-and-modify intercepts are
 *   ported as: /api/task list → native-fetch the real response and overwrite
 *   `.data` (route.fetch chokes on the backend's set-cookie under bun — same
 *   workaround as admin-extras.mockSessionProperty); /api/task/runs list →
 *   fulfilled directly (upstream replaced the whole body).
 * - Copy button: the Cypress spec stubbed navigator.clipboard.writeText and
 *   asserted calledWith; here we grant clipboard permissions and read the real
 *   clipboard back (equivalent, and doesn't need a spy).
 * - Downloads: cy.readFile(cypress/downloads/*) → page download event + parse.
 * - Retried location() assertions → expect.poll (one-shot checks catch
 *   transient states — PORTING gotcha).
 * - EE describes (erroring questions / model persistence) are token-gated; the
 *   jar activates the token.
 */
import fs from "fs";

import type { Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import {
  assertFilterByEntityTooltipText,
  createErroringQuestion,
  createMockTask,
  fixQuestion,
  formatTimestamp,
  getFilterByEntity,
  getFilterByRun,
  getFilterByStartedAt,
  getFilterByStatus,
  selectQuestion,
  selectStartedAt,
} from "../support/admin-tools";
import { deleteToken } from "../support/admin-extras";
import type { NativeQuestionDetails } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { caseSensitiveSubstring } from "../support/text";
import { icon, modal, popover } from "../support/ui";

const search = (page: Page) => new URL(page.url()).search;
const pathname = (page: Page) => new URL(page.url()).pathname;

test.describe("issue 14636", () => {
  const total = 57;
  const limit = 50;

  function stubPageRows(page: number) {
    // The row details don't really matter — one row type per page.
    const tasks = ["field values scanning", "analyze"];
    const durations = [513, 200];

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

    return Array.from({ length }, (_, index) => ({ ...row, id: index + 1 }));
  }

  // Matches the fully-unfiltered task-list request (Cypress glob semantics).
  const isTaskPageRequest = (url: URL) =>
    url.pathname === "/api/task" &&
    url.searchParams.get("limit") === String(limit) &&
    url.searchParams.get("sort_column") === "started_at" &&
    url.searchParams.get("sort_direction") === "desc" &&
    !url.searchParams.has("status") &&
    !url.searchParams.has("task");

  const isTaskPage = (offset: number) => (url: URL) =>
    isTaskPageRequest(url) && url.searchParams.get("offset") === String(offset);

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    // The only reliable way to reproduce this issue is by stubbing page
    // responses — real tasks (>50) were flaky.
    await page.route(
      (url) => isTaskPageRequest(url),
      async (route) => {
        const url = new URL(route.request().url());
        const page = url.searchParams.get("offset") === String(limit) ? 1 : 0;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: stubPageRows(page),
            limit,
            offset: page * limit,
            total,
          }),
        });
      },
    );
  });

  test("pagination should work (metabase#14636)", async ({ page }) => {
    const first = page.waitForResponse((r) => isTaskPage(0)(new URL(r.url())));
    await page.goto("/admin/tools/tasks/list");
    await first;

    await expect.poll(() => search(page)).toBe("");

    await expect(
      page.getByText("Troubleshooting logs", { exact: true }),
    ).toBeVisible();

    const pagination = page.getByLabel("pagination");
    await expect(pagination.getByText("1 - 50", { exact: true })).toBeVisible();
    await expect(
      page.getByText(caseSensitiveSubstring("field values scanning")).first(),
    ).toBeVisible();
    await expect(
      page.getByText(caseSensitiveSubstring("513")).first(),
    ).toBeVisible();

    await expect(page.getByLabel("Previous page")).toBeDisabled();
    await expect(page.getByLabel("Next page")).not.toBeDisabled();
    const second = page.waitForResponse((r) => isTaskPage(50)(new URL(r.url())));
    await page.getByLabel("Next page").click();
    await second;

    await expect.poll(() => search(page)).toBe("?page=1");

    await expect(
      pagination.getByText(`51 - ${total}`, { exact: true }),
    ).toBeVisible();
    await expect(pagination.getByText("1 - 50", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(caseSensitiveSubstring("analyze")).first(),
    ).toBeVisible();
    await expect(
      page.getByText(caseSensitiveSubstring("200")).first(),
    ).toBeVisible();

    await expect(page.getByLabel("Next page")).toBeDisabled();
    await expect(page.getByLabel("Previous page")).not.toBeDisabled();
    await page.getByLabel("Previous page").click();

    await expect.poll(() => search(page)).toBe("");

    // pagination should affect browser history
    await page.goBack();
    await expect.poll(() => pathname(page)).toBe("/admin/tools/tasks/list");
    await expect.poll(() => search(page)).toBe("?page=1");
    await page.goBack();
    await expect.poll(() => pathname(page)).toBe("/admin/tools/tasks/list");
    await expect.poll(() => search(page)).toBe("");

    // it should respect page query param on page load
    const second2 = page.waitForResponse((r) =>
      isTaskPage(50)(new URL(r.url())),
    );
    await page.goto("/admin/tools/tasks/list?page=1");
    await second2;

    await expect(
      pagination.getByText(`51 - ${total}`, { exact: true }),
    ).toBeVisible();
  });

  test("filtering should work", async ({ page }) => {
    await page.goto(
      "/admin/tools/tasks/list?status=success&task=field+values+scanning",
    );

    await expect(page.getByPlaceholder("Filter by task")).toHaveValue(
      "field values scanning",
    );
    await expect(getFilterByStatus(page)).toHaveValue("Success");
    await expect(page.getByTestId("task")).toHaveCount(1);
    await expect(page.getByTestId("task")).toContainText("field values scanning");
    await expect(page.getByTestId("task")).toContainText("Sample Database");
    await expect(page.getByTestId("task")).toContainText("Success");

    await getFilterByStatus(page).click();
    await popover(page).getByText("Failed", { exact: true }).click();
    await expect
      .poll(() => search(page))
      .toBe("?status=failed&task=field+values+scanning");
    await expect(page.getByTestId("task")).toHaveCount(0);
    await expect(page.getByTestId("admin-layout-content")).toContainText(
      "No results",
    );

    await getFilterByStatus(page).locator("..").getByLabel("Clear").click();
    await expect.poll(() => search(page)).toBe("?task=field+values+scanning");
    await expect(getFilterByStatus(page)).toHaveValue("");
    await expect(page.getByTestId("task")).toHaveCount(1);
    await expect(page.getByTestId("task")).toContainText("field values scanning");
    await expect(page.getByTestId("task")).toContainText("Sample Database");
    await expect(page.getByTestId("task")).toContainText("Success");

    const first = page.waitForResponse((r) => isTaskPage(0)(new URL(r.url())));
    await page
      .getByPlaceholder("Filter by task")
      .locator("..")
      .getByLabel("Clear")
      .click();
    await expect.poll(() => search(page)).toBe("");
    await first;
    await expect(page.getByTestId("task")).toHaveCount(50);
    await expect(
      page.getByLabel("pagination").getByText("1 - 50", { exact: true }),
    ).toBeVisible();

    // should reset pagination when changing filters
    await page.goto("/admin/tools/tasks/list?page=1");
    await getFilterByStatus(page).click();
    await popover(page).getByText("Success", { exact: true }).click();
    await expect.poll(() => search(page)).toBe("?status=success");

    // should remove invalid query params
    await page.goto("/admin/tools/tasks/list?status=foobar");
    await expect.poll(() => search(page)).toBe("");
    await expect(getFilterByStatus(page)).toHaveValue("");
  });
});

test.describe("scenarios > admin > tools > tasks", () => {
  const task = createMockTask({
    task_details: {
      useful: {
        information: true,
      },
    },
  });

  const formattedTaskJson = JSON.stringify(task.task_details, null, 2);

  test.beforeEach(async ({ page, mb, context }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // The only reliable way of having a consistent list of tasks is mocking.
    // Passthrough + overwrite `.data` (mirrors the Cypress reply callback).
    await page.route(
      (url) => url.pathname === "/api/task",
      async (route) => {
        const request = route.request();
        const response = await fetch(request.url(), {
          headers: await request.allHeaders(),
        });
        const body = (await response.json()) as Record<string, unknown>;
        body.data = [task];
        await route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      },
    );

    await page.route(
      (url) => url.pathname === `/api/task/${task.id}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(task),
        }),
    );
  });

  test("shows task details page", async ({ page }) => {
    const getTasks = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/task",
    );
    await page.goto("/admin/tools/tasks/list");
    await getTasks;

    const getTask = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/task/${task.id}`,
    );
    await page
      .getByTestId("tasks-table")
      .getByText("A task", { exact: true })
      .click();
    await getTask;
    await expect
      .poll(() => pathname(page))
      .toBe(`/admin/tools/tasks/list/${task.id}`);

    // task details
    await expect(page.locator(".cm-content")).toBeVisible();
    const lines = page.locator(".cm-line");
    await expect(lines.nth(0)).toHaveText("{");
    await expect(lines.nth(1)).toHaveText('  "useful": {');
    await expect(lines.nth(2)).toHaveText('    "information": true');
    await expect(lines.nth(3)).toHaveText("  }");
    await expect(lines.nth(4)).toHaveText("}");

    // copy button
    await icon(page.getByTestId("code-container"), "copy").click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(formattedTaskJson);
    await expect(page.getByRole("tooltip")).toHaveText("Copied!");

    // download button
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download/ }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`task-${task.id}.json`);
    const contents = JSON.parse(
      fs.readFileSync(await download.path(), "utf-8"),
    );
    expect(contents).toEqual(task.task_details);
  });

  test("should render logs when they are present", async ({ page }) => {
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

    await page.route(
      (url) => url.pathname === `/api/task/${task.id}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(taskWithLogs),
        }),
    );

    const getTaskWithLogs = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/task/${task.id}`,
    );
    await page.goto(`/admin/tools/tasks/list/${task.id}`);
    await getTaskWithLogs;

    const taskLogs = page.getByTestId("task-logs");
    await taskLogs.scrollIntoViewIfNeeded();
    await expect(taskLogs).toBeVisible();
    await expect(
      taskLogs.getByText(new RegExp(taskWithLogs.logs[0].msg)),
    ).toBeVisible();
    await expect(
      taskLogs.getByText(new RegExp(taskWithLogs.logs[1].msg)),
    ).toBeVisible();
  });

  test("should show empty state when no logs are present", async ({ page }) => {
    const taskWithoutLogs = { ...task, logs: [] };

    await page.route(
      (url) => url.pathname === `/api/task/${task.id}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(taskWithoutLogs),
        }),
    );

    const getTaskWithoutLogs = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/task/${task.id}`,
    );
    await page.goto(`/admin/tools/tasks/list/${task.id}`);
    await getTaskWithoutLogs;

    await expect(page.getByTestId("task-logs")).toHaveCount(0);
    await expect(
      page
        .getByTestId("admin-layout-content")
        .getByText("There are no captured logs", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("scenarios > admin > tools > logs", () => {
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

  test.beforeEach(async ({ page, mb }) => {
    await page.route(
      (url) => url.pathname === "/api/logger/logs",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([log1, log2]),
        }),
    );

    await mb.restore();
    await mb.signInAsAdmin();

    const getLogs = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/logger/logs",
    );
    await page.goto("/admin/tools/logs");
    await getLogs;
  });

  test("should allow to download logs", async ({ page }) => {
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download/ }).click();
    const download = await downloadEvent;
    const contents = fs.readFileSync(await download.path(), "utf-8");
    expect(contents).toBe(
      [
        `[e7774ef2-42ab-43de-89f7-d6de9fdc624f] ${formatTimestamp(log1.timestamp)} DEBUG metabase.server.middleware.log message`,
        `[9da436dc-d79c-42f9-89e3-322c22cd0cd3] ${formatTimestamp(log2.timestamp)} ERROR metabase.server.middleware.log message`,
      ].join("\n"),
    );
  });

  test("should allow to download filtered logs", async ({ page }) => {
    await page.getByPlaceholder("Filter logs").fill("error");
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download/ }).click();
    const download = await downloadEvent;
    const contents = fs.readFileSync(await download.path(), "utf-8");
    expect(contents).toBe(
      `[9da436dc-d79c-42f9-89e3-322c22cd0cd3] ${formatTimestamp(log2.timestamp)} ERROR metabase.server.middleware.log message`,
    );
  });
});

test.describe("admin > tools > erroring questions", () => {
  const TOOLS_ERRORS_URL = "/admin/tools/errors";
  // The filter is required but doesn't have a default value set.
  const brokenQuestionDetails: NativeQuestionDetails = {
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

  test.describe("when feature enabled", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "requires the pro-self-hosted token",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
    });

    test.describe("without broken questions", () => {
      test('should render the "Tools" tab and navigate to the "Erroring Questions" by clicking on it', async ({
        page,
      }) => {
        // The sidebar has been taken out (awkward with only one elem); put it
        // back when there's more than one.
        await page.goto("/admin");

        await page
          .locator("nav")
          .getByText("Tools", { exact: true })
          .first()
          .click();

        await page
          .getByRole("link", { name: /Erroring questions/ })
          .click();
        await expect.poll(() => pathname(page)).toBe(TOOLS_ERRORS_URL);

        // test no results state
        await expect(
          page
            .getByTestId("visualization-root")
            .getByText("No results", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Rerun Selected" }),
        ).toBeDisabled();
        await expect(page.getByPlaceholder("Error contents")).toBeDisabled();
        await expect(page.getByPlaceholder("DB name")).toBeDisabled();
        await expect(page.getByPlaceholder("Collection name")).toBeDisabled();
      });
    });

    test.describe("with the existing broken questions", () => {
      test.beforeEach(async ({ page, mb }) => {
        await createErroringQuestion(page, mb.api, brokenQuestionDetails);
        await page.goto(TOOLS_ERRORS_URL);
      });

      test("should render correctly", async ({ page }) => {
        const datasetPath = (r: { url(): string }) =>
          new URL(r.url()).pathname === "/api/dataset";

        // The list loads via /api/dataset.
        await page.waitForResponse(datasetPath);

        await selectQuestion(page, brokenQuestionDetails.name!);

        const rerun1 = page.waitForResponse(datasetPath);
        await expect(
          page.getByRole("button", { name: "Rerun Selected" }),
        ).not.toBeDisabled();
        await page.getByRole("button", { name: "Rerun Selected" }).click();
        await rerun1;

        // The question is still there because we didn't fix it.
        await expect(
          page
            .getByTestId("visualization-root")
            .getByText(brokenQuestionDetails.name!, { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Rerun Selected" }),
        ).toBeDisabled();

        await expect(page.getByPlaceholder("Error contents")).not.toBeDisabled();
        await expect(page.getByPlaceholder("DB name")).not.toBeDisabled();

        const filterQuery = page.waitForResponse(datasetPath);
        await expect(
          page.getByPlaceholder("Collection name"),
        ).not.toBeDisabled();
        await page.getByPlaceholder("Collection name").fill("foo");
        await filterQuery;

        await expect(
          page
            .getByTestId("visualization-root")
            .getByText("No results", { exact: true }),
        ).toBeVisible();

        await page.getByPlaceholder("Collection name").clear();

        await fixQuestion(page, brokenQuestionDetails.name!);

        await page.goto(TOOLS_ERRORS_URL);

        await selectQuestion(page, brokenQuestionDetails.name!);

        const rerun2 = page.waitForResponse(datasetPath);
        await expect(
          page.getByRole("button", { name: "Rerun Selected" }),
        ).not.toBeDisabled();
        await page.getByRole("button", { name: "Rerun Selected" }).click();
        await rerun2;

        await expect(
          page
            .getByTestId("visualization-root")
            .getByText("No results", { exact: true }),
        ).toBeVisible();
      });
    });
  });
});

test.describe("admin > tools", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should show either the erroring questions or the upsell (based on the `audit_app` feature flag)", async ({
    page,
    mb,
  }) => {
    // Enable model persistence to have multiple tabs/routes in tools.
    await mb.api.post("/api/persist/enable");
    await page.goto("/admin/tools/errors");

    await expect(
      page.getByRole("heading", {
        name: "Questions that errored when last run",
      }),
    ).toBeVisible();

    // We should be able to switch to the model caching page.
    await page
      .getByTestId("admin-layout-sidebar")
      .getByText("Model cache log", { exact: true })
      .click();
    await expect
      .poll(() => pathname(page))
      .toBe("/admin/tools/model-caching");

    // Once the audit_app feature flag is gone, tools should display an upsell.
    await deleteToken(mb.api);
    await page.goto("/admin/tools/errors");

    await expect(
      page.getByRole("heading", { name: "Troubleshoot faster" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Try for free" }),
    ).toBeVisible();
  });

  test.describe("issue 57113", () => {
    test("should navigate to /admin/tools/tasks/list when clicking Back to Tasks even with no browser history", async ({
      page,
    }) => {
      await page.goto("/admin/tools/tasks/list");

      // Pick an existing task url.
      await page.getByTestId("task").first().click();

      await expect
        .poll(() => pathname(page))
        .toMatch(/\/admin\/tools\/tasks\/list\/[0-9]+$/);
      const taskPath = pathname(page);

      // Clear all history: replace state, then navigate to about:blank so the
      // history stack is empty, then visit the task detail page fresh. Do the
      // about:blank hop through page.goto (not a bare location.href assignment
      // in evaluate, which races the subsequent goto).
      await page.evaluate((p) => {
        window.history.replaceState(null, "", p);
      }, taskPath);
      await page.goto("about:blank");

      await page.goto(taskPath);
      await page.getByText("Back to Tasks", { exact: true }).click();
      await expect.poll(() => pathname(page)).toBe("/admin/tools/tasks/list");
    });
  });
});

test.describe("scenarios > admin > tools > task runs", () => {
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

  const isRunsList = (url: URL) => url.pathname === "/api/task/runs";
  const isRunDetail = (url: URL) =>
    /^\/api\/task\/runs\/\d+$/.test(url.pathname);

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await page.route(
      (url) => isRunsList(url),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [taskRun],
            total: 1,
            limit: 50,
            offset: 0,
          }),
        }),
    );

    await page.route(
      (url) => isRunDetail(url),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(taskRunExtended),
        }),
    );
  });

  test("should switch between Tasks and Runs tabs", async ({ page }) => {
    await page.goto("/admin/tools/tasks/list");

    await expect(page.getByTestId("tasks-table")).toBeVisible();

    await page.getByRole("tab", { name: /Runs/i }).click();
    await expect.poll(() => pathname(page)).toBe("/admin/tools/tasks/runs");
    await expect(page.getByTestId("task-runs-table")).toBeVisible();

    await page.getByRole("tab", { name: /Tasks/i }).click();
    await expect.poll(() => pathname(page)).toBe("/admin/tools/tasks/list");
    await expect(page.getByTestId("tasks-table")).toBeVisible();
  });

  test("should navigate to task run details and show associated tasks", async ({
    page,
  }) => {
    const getTaskRuns = page.waitForResponse((r) => isRunsList(new URL(r.url())));
    await page.goto("/admin/tools/tasks/runs");
    await getTaskRuns;

    const getTaskRun = page.waitForResponse((r) =>
      isRunDetail(new URL(r.url())),
    );
    await page
      .getByTestId("task-runs-table")
      .getByTestId("task-run")
      .first()
      .click();
    await getTaskRun;

    await expect
      .poll(() => pathname(page))
      .toBe(`/admin/tools/tasks/runs/${taskRun.id}`);

    const content = page.getByTestId("admin-layout-content");
    await expect(content.getByText("Run type", { exact: true })).toBeVisible();
    await expect(content.getByText("Entity", { exact: true })).toBeVisible();
    await expect(
      content.getByText("Sample Database", { exact: true }),
    ).toBeVisible();

    await expect(page.getByTestId("task-run-tasks-table")).toBeVisible();
    await expect(page.getByTestId("task-run-task")).toHaveCount(3);
  });

  test("should navigate back to runs list from run details", async ({
    page,
  }) => {
    const getTaskRun = page.waitForResponse((r) =>
      isRunDetail(new URL(r.url())),
    );
    await page.goto(`/admin/tools/tasks/runs/${taskRun.id}`);
    await getTaskRun;

    await page.getByRole("link", { name: /Back to Runs/i }).click();
    await expect.poll(() => pathname(page)).toBe("/admin/tools/tasks/runs");
  });

  test("should have clickable entity link in task run details", async ({
    page,
  }) => {
    const getTaskRun = page.waitForResponse((r) =>
      isRunDetail(new URL(r.url())),
    );
    await page.goto(`/admin/tools/tasks/runs/${taskRun.id}`);
    await getTaskRun;

    await page.getByRole("link", { name: /Sample Database/i }).click();
    await expect.poll(() => pathname(page)).toBe("/admin/databases/1");
  });

  test("should navigate to task details from task run details", async ({
    page,
  }) => {
    const getTaskRun = page.waitForResponse((r) =>
      isRunDetail(new URL(r.url())),
    );
    await page.goto(`/admin/tools/tasks/runs/${taskRun.id}`);
    await getTaskRun;

    await page
      .getByTestId("task-run-tasks-table")
      .getByTestId("task-run-task")
      .first()
      .click();

    await expect
      .poll(() => pathname(page))
      .toBe(`/admin/tools/tasks/list/${taskRunExtended.tasks[0].id}`);
  });
});

test.describe("scenarios > admin > tools > task runs pagination", () => {
  const total = 57;
  const limit = 50;

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

    return Array.from({ length }, (_, index) => ({ ...row, id: index + 1 }));
  }

  // Matches the fully-unfiltered runs-list request (Cypress glob semantics).
  const isRunsPageRequest = (url: URL) =>
    url.pathname === "/api/task/runs" &&
    url.searchParams.get("limit") === String(limit) &&
    !url.searchParams.has("run-type") &&
    !url.searchParams.has("entity-type") &&
    !url.searchParams.has("entity-id") &&
    !url.searchParams.has("status") &&
    !url.searchParams.has("started-at");

  const isRunsPage = (offset: number) => (url: URL) =>
    isRunsPageRequest(url) && url.searchParams.get("offset") === String(offset);

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await page.route(
      (url) => isRunsPageRequest(url),
      async (route) => {
        const url = new URL(route.request().url());
        const page = url.searchParams.get("offset") === String(limit) ? 1 : 0;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: stubRunsPageRows(page),
            limit,
            offset: page * limit,
            total,
          }),
        });
      },
    );
  });

  test("pagination should work for task runs", async ({ page }) => {
    const first = page.waitForResponse((r) => isRunsPage(0)(new URL(r.url())));
    await page.goto("/admin/tools/tasks/runs");
    await first;

    await expect.poll(() => search(page)).toBe("");

    await expect(
      page.getByLabel("pagination").getByText("1 - 50", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("task-runs-table")).toContainText("Sync");

    await expect(page.getByLabel("Previous page")).toBeDisabled();
    await expect(page.getByLabel("Next page")).not.toBeDisabled();
    const second = page.waitForResponse((r) => isRunsPage(50)(new URL(r.url())));
    await page.getByLabel("Next page").click();
    await second;

    await expect.poll(() => search(page)).toBe("?page=1");

    const pagination = page.getByLabel("pagination");
    await pagination.scrollIntoViewIfNeeded();
    await expect(
      pagination.getByText(`51 - ${total}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("task-runs-table")).toContainText(
      "Fingerprint",
    );

    await expect(page.getByLabel("Next page")).toBeDisabled();
    await expect(page.getByLabel("Previous page")).not.toBeDisabled();
    await page.getByLabel("Previous page").click();

    await expect.poll(() => search(page)).toBe("");
  });
});

test.describe("scenarios > admin > tools > task runs filtering", () => {
  const isRunsList = (url: URL) => url.pathname === "/api/task/runs";
  const isEntities = (url: URL) =>
    url.pathname === "/api/task/runs/entities";

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await page.route(
      (url) => isRunsList(url),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [], total: 0, limit: 50, offset: 0 }),
        }),
    );

    await page.route(
      (url) => isEntities(url),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              entity_type: "database",
              entity_id: 1,
              entity_name: "Sample Database",
            },
            {
              entity_type: "database",
              entity_id: 2,
              entity_name: "Test Database",
            },
          ]),
        }),
    );
  });

  test("filtering should work for task runs", async ({ page }) => {
    const getTaskRuns = page.waitForResponse((r) => isRunsList(new URL(r.url())));
    await page.goto("/admin/tools/tasks/runs");
    await getTaskRuns;

    // Filter by run type
    let wait = page.waitForResponse((r) => isRunsList(new URL(r.url())));
    await getFilterByRun(page).click();
    await popover(page).getByText("Sync", { exact: true }).click();
    await expect.poll(() => search(page)).toContain("run-type=sync");
    await wait;

    // Filter by started at. Setting started-at (with run-type already set)
    // triggers the entities load, so register that wait BEFORE the action.
    wait = page.waitForResponse((r) => isRunsList(new URL(r.url())));
    const getEntities = page.waitForResponse((r) => isEntities(new URL(r.url())));
    await selectStartedAt(page, "Previous 30 days");
    await expect.poll(() => search(page)).toContain("started-at=past30days");
    await wait;

    await getEntities;
    // Filter by entity
    wait = page.waitForResponse((r) => isRunsList(new URL(r.url())));
    await getFilterByEntity(page).click();
    await popover(page).getByText("Sample Database", { exact: true }).click();
    await expect.poll(() => search(page)).toContain("entity-type=database");
    await expect.poll(() => search(page)).toContain("entity-id=1");
    await wait;

    // Filter by status
    wait = page.waitForResponse((r) => isRunsList(new URL(r.url())));
    await getFilterByStatus(page).click();
    await popover(page).getByText("Success", { exact: true }).click();
    await expect.poll(() => search(page)).toContain("status=success");
    await wait;

    // Clear all filters
    await getFilterByRun(page).locator("..").getByLabel("Clear").click();
    await getFilterByStartedAt(page).locator("..").getByLabel("Clear").click();
    await getFilterByStatus(page).locator("..").getByLabel("Clear").click();
    await expect.poll(() => search(page)).toBe("");
  });

  test("entity picker should be disabled/enabled based on run type, started at and entities availability", async ({
    page,
  }) => {
    const getTaskRuns = page.waitForResponse((r) => isRunsList(new URL(r.url())));
    await page.goto("/admin/tools/tasks/runs");
    await getTaskRuns;

    // Should be disabled when no run type is selected
    await expect(getFilterByEntity(page)).toBeDisabled();
    await assertFilterByEntityTooltipText(page, "Select a run type first");

    await getFilterByRun(page).click();
    await popover(page).getByText("Sync", { exact: true }).click();

    // Should still be disabled until started at is selected
    await expect(getFilterByEntity(page)).toBeDisabled();
    await assertFilterByEntityTooltipText(page, "Select a start time first");

    // Override entities with a delayed response so the loader is observable.
    await page.route(
      (url) => isEntities(url),
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              entity_type: "database",
              entity_id: 1,
              entity_name: "Sample Database",
            },
          ]),
        });
      },
    );

    const getEntitiesDelayed = page.waitForResponse((r) =>
      isEntities(new URL(r.url())),
    );
    await selectStartedAt(page, "Previous 30 days");

    // Should show loader while loading entities
    await expect(getFilterByEntity(page)).toBeDisabled();
    await expect(
      getFilterByEntity(page)
        .locator(
          "xpath=ancestor::*[contains(@class,'mb-mantine-Select-root')][1]",
        )
        .locator(".mb-mantine-Loader-root"),
    ).toBeVisible();

    await getEntitiesDelayed;

    // Should be enabled after entities are loaded
    await expect(getFilterByEntity(page)).not.toBeDisabled();

    // Should clear and disable entity filter when run type is cleared
    await getFilterByRun(page).locator("..").getByLabel("Clear").click();
    await expect(getFilterByEntity(page)).toBeDisabled();
    await expect(getFilterByEntity(page)).toHaveValue("");

    // Should clear and disable entity filter when started at is cleared
    await getFilterByRun(page).click();
    await popover(page).getByText("Sync", { exact: true }).click();
    await getFilterByStartedAt(page).locator("..").getByLabel("Clear").click();
    await expect(getFilterByEntity(page)).toBeDisabled();
    await expect(getFilterByEntity(page)).toHaveValue("");

    // Should show tooltip 'No entities available' when no entities
    await page.route(
      (url) => isEntities(url),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        }),
    );

    const getEmptyEntities = page.waitForResponse((r) =>
      isEntities(new URL(r.url())),
    );
    await getFilterByRun(page).click();
    await popover(page).getByText("Alert", { exact: true }).click();
    await selectStartedAt(page, "Previous 30 days");
    await getEmptyEntities;

    await expect(getFilterByEntity(page)).toBeDisabled();
    await assertFilterByEntityTooltipText(page, "No entities available");
  });
});
