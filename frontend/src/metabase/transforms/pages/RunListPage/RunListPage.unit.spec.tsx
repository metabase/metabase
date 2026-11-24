import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGetTransformEndpoint,
  setupListDatabaseSchemasEndpoint,
  setupListTransformRunsEndpoint,
  setupListTransformTagsEndpoint,
  setupListTransformsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import { formatRunMethod, formatStatus } from "metabase/transforms/utils";
import * as Urls from "metabase/urls";
import { isNotNull } from "metabase/utils/types";
import type {
  ListTransformRunsResponse,
  TransformRun,
} from "metabase-types/api";
import {
  createMockListTransformRunsResponse,
  createMockTransform,
  createMockTransformRun,
  createMockTransformTag,
} from "metabase-types/api/mocks";

import { RunListPage } from "./RunListPage";

type SetupOpts = {
  runs?: TransformRun[];
};

function setup({ runs = [] }: SetupOpts = {}) {
  const transforms = runs.map((run) => run.transform).filter(isNotNull);

  setupUserMetabotPermissionsEndpoint();
  setupListTransformRunsEndpoint(
    createMockListTransformRunsResponse({
      data: runs,
      total: runs.length,
    }),
  );
  if (transforms.length) {
    setupListTransformsEndpoint(transforms);
  }
  setupListTransformTagsEndpoint([]);
  transforms.forEach((transform) => {
    setupGetTransformEndpoint(transform);
    setupListDatabaseSchemasEndpoint(transform.target.database, []);
  });
  mockGetBoundingClientRect({ width: 1200, height: 800 });

  const path = Urls.transformRunList();

  renderWithProviders(<Route path={path} element={<RunListPage />} />, {
    withRouter: true,
    initialRoute: path,
  });
}

describe("RunListPage", () => {
  it("should render runs and open sidebar on click", async () => {
    const transform = createMockTransform({ name: "My Transform" });
    const run = createMockTransformRun({
      status: "succeeded",
      transform,
    });
    setup({ runs: [run] });

    const row = await screen.findByRole("row", { name: /My Transform/ });
    await userEvent.click(row);

    const infoSection = await screen.findByRole("region", { name: "Info" });
    expect(infoSection).toBeInTheDocument();
    expect(within(infoSection).getByText("Success")).toBeInTheDocument();
  });

  it("should show error section in sidebar for failed runs", async () => {
    const transform = createMockTransform({ name: "Broken Transform" });
    const run = createMockTransformRun({
      status: "failed",
      transform,
      message: 'relation "abc" does not exist',
    });
    setup({ runs: [run] });

    const row = await screen.findByRole("row", {
      name: /Broken Transform/,
    });
    await userEvent.click(row);

    expect(
      await screen.findByRole("region", { name: "Error" }),
    ).toBeInTheDocument();

    const infoSection = screen.getByRole("region", { name: "Info" });
    expect(within(infoSection).getByText("Failed")).toBeInTheDocument();
  });

  describe("Duration column", () => {
    it("renders a Duration column header when the table is populated", async () => {
      const transform = createMockTransform({ name: "Some Transform" });
      const run = createMockTransformRun({ status: "succeeded", transform });
      setup({ runs: [run] });
      expect(
        await screen.findByRole("columnheader", { name: /duration/i }),
      ).toBeInTheDocument();
    });

    it("renders the formatted duration for completed runs", async () => {
      // 8m 42s duration: start at 00:00:00, end at 00:08:42.
      const transform = createMockTransform({ name: "Long batch" });
      const run = createMockTransformRun({
        status: "succeeded",
        transform,
        start_time: "2026-01-01T00:00:00.000Z",
        end_time: "2026-01-01T00:08:42.000Z",
      });
      setup({ runs: [run] });
      expect(await screen.findByText("8m 42s")).toBeInTheDocument();
    });

    it("renders the placeholder for runs still in progress (no end_time)", async () => {
      const transform = createMockTransform({ name: "In flight" });
      const run = createMockTransformRun({
        status: "started",
        transform,
        start_time: "2026-01-01T00:00:00.000Z",
        end_time: null,
      });
      setup({ runs: [run] });

      // Resolve the Duration column's index from the headers (robust to
      // column reordering); then scope the placeholder assertion to that
      // specific gridcell in the in-progress row.
      const headers = await screen.findAllByRole("columnheader");
      const durationIndex = headers.findIndex((h) =>
        /duration/i.test(h.textContent ?? ""),
      );
      expect(durationIndex).toBeGreaterThan(-1);

      const row = await screen.findByRole("row", { name: /In flight/ });
      const cells = within(row).getAllByRole("gridcell");
      expect(cells[durationIndex]).toHaveTextContent("—");
    });
  });

  describe("Ended at column null handling", () => {
    it("renders the placeholder for runs still in progress (no end_time)", async () => {
      const transform = createMockTransform({ name: "Mid flight" });
      const run = createMockTransformRun({
        status: "started",
        transform,
        start_time: "2026-01-01T00:00:00.000Z",
        end_time: null,
      });
      setup({ runs: [run] });

      const headers = await screen.findAllByRole("columnheader");
      const endedAtIndex = headers.findIndex((h) =>
        /ended at/i.test(h.textContent ?? ""),
      );
      expect(endedAtIndex).toBeGreaterThan(-1);

      const row = await screen.findByRole("row", { name: /Mid flight/ });
      const cells = within(row).getAllByRole("gridcell");
      expect(cells[endedAtIndex]).toHaveTextContent("—");
    });
  });
});

const TAG_1 = createMockTransformTag({ id: 11, name: "tag1" });
const TAG_2 = createMockTransformTag({ id: 12, name: "tag2" });

const MBQL_TRANSFORM = createMockTransform({
  id: 1,
  name: "MBQL transform",
  tag_ids: [TAG_1.id],
});
const SQL_TRANSFORM = createMockTransform({
  id: 2,
  name: "SQL transform",
  tag_ids: [TAG_2.id],
});

const MBQL_RUN = createMockTransformRun({
  id: 101,
  transform_id: MBQL_TRANSFORM.id,
  transform: MBQL_TRANSFORM,
  status: "succeeded",
  run_method: "manual",
  start_time: "2026-01-01T10:00:00Z",
  end_time: "2026-01-01T10:05:00Z",
});
const SQL_RUN = createMockTransformRun({
  id: 102,
  transform_id: SQL_TRANSFORM.id,
  transform: SQL_TRANSFORM,
  status: "failed",
  run_method: "manual",
  start_time: "2026-01-01T11:00:00Z",
  end_time: "2026-01-01T11:01:00Z",
});

const ALL_RUNS = [MBQL_RUN, SQL_RUN];
const ALL_TAGS = [TAG_1, TAG_2];

// The runs that the backend considers to match each relative date filter
// value the date picker produces; any other value is unexpected.
const DATE_FILTER_MATCHES: Record<string, boolean> = {
  thisday: true,
  "past30days~": true,
  past1weeks: false,
};

const RUNS_PATH = "path:/api/transform/run";

function getTagNames(run: TransformRun) {
  return (run.transform?.tag_ids ?? [])
    .map((tagId) => ALL_TAGS.find((tag) => tag.id === tagId)?.name ?? "")
    .join(", ");
}

const SORT_VALUES: Record<string, (run: TransformRun) => string> = {
  "transform-name": (run) => run.transform?.name ?? "",
  "start-time": (run) => run.start_time,
  "end-time": (run) => run.end_time ?? "",
  status: (run) => formatStatus(run.status),
  "run-method": (run) => formatRunMethod(run.run_method),
  "transform-tags": getTagNames,
};

function matchesDateFilter(value: string | null) {
  if (value == null) {
    return true;
  }
  const matches = DATE_FILTER_MATCHES[value];
  if (matches == null) {
    throw new Error(`Unexpected date filter value: ${value}`);
  }
  return matches;
}

// Stands in for the server-side filtering and sorting of GET /api/transform/run
function listRuns(searchParams: URLSearchParams): ListTransformRunsResponse {
  const transformIds = searchParams.getAll("transform-ids").map(Number);
  const statuses = searchParams.getAll("statuses");
  const tagIds = searchParams.getAll("transform-tag-ids").map(Number);
  const runMethods = searchParams.getAll("run-methods");
  const sortColumn = searchParams.get("sort-column");
  const sortDirection = searchParams.get("sort-direction");

  const runs = ALL_RUNS.filter(
    (run) =>
      (transformIds.length === 0 ||
        transformIds.includes(run.transform_id ?? -1)) &&
      (statuses.length === 0 || statuses.includes(run.status)) &&
      (tagIds.length === 0 ||
        (run.transform?.tag_ids ?? []).some((tagId) =>
          tagIds.includes(tagId),
        )) &&
      (runMethods.length === 0 || runMethods.includes(run.run_method)) &&
      matchesDateFilter(searchParams.get("start-time")) &&
      matchesDateFilter(searchParams.get("end-time")),
  );

  if (sortColumn != null) {
    const getValue = SORT_VALUES[sortColumn];
    runs.sort((a, b) => getValue(a).localeCompare(getValue(b)) || a.id - b.id);
    if (sortDirection === "desc") {
      runs.reverse();
    }
  }

  return createMockListTransformRunsResponse({
    data: runs,
    total: runs.length,
  });
}

function setupWithFilters() {
  setupUserMetabotPermissionsEndpoint();
  fetchMock.get(RUNS_PATH, (call) => listRuns(new URL(call.url).searchParams));
  setupListTransformsEndpoint([MBQL_TRANSFORM, SQL_TRANSFORM]);
  setupListTransformTagsEndpoint(ALL_TAGS);
  mockGetBoundingClientRect({ width: 1200, height: 800 });

  const path = Urls.transformRunList();
  const { router } = renderWithProviders(
    <Route path={path} element={<RunListPage />} />,
    { withRouter: true, initialRoute: path },
  );
  return { router };
}

function getRunTable() {
  return screen.getByRole("treegrid", { name: "Transform runs" });
}

function getFilterWidget(name: string) {
  return screen.getByRole("group", { name });
}

async function expectRunNames(names: string[]) {
  await waitFor(() => {
    const rowNames = within(getRunTable())
      .queryAllByRole("row")
      .map((row) => row.textContent ?? "")
      .flatMap((text) =>
        ["MBQL transform", "SQL transform"].filter((name) =>
          text.includes(name),
        ),
      );
    expect(rowNames).toEqual(names);
  });
}

async function expectLastRunsQuery(expected: Record<string, string[]>) {
  await waitFor(() => {
    const call = fetchMock.callHistory.lastCall(RUNS_PATH);
    const searchParams = new URL(call?.url ?? "http://x").searchParams;
    const actual: Record<string, string[]> = {};
    for (const key of new Set(searchParams.keys())) {
      if (key !== "offset" && key !== "limit") {
        actual[key] = searchParams.getAll(key);
      }
    }
    expect(actual).toEqual(expected);
  });
}

async function openFilter(name: string) {
  await userEvent.click(getFilterWidget(name));
  return screen.findByRole("dialog");
}

async function removeFilter(name: string) {
  await userEvent.click(
    within(getFilterWidget(name)).getByRole("button", {
      name: "Remove filter",
    }),
  );
}

const BOTH = ["MBQL transform", "SQL transform"];

type MultiSelectFilterCase = {
  widget: string;
  param: string;
  firstOption: string;
  secondOption: string;
  firstValues: string[];
  secondValues: string[];
  bothValues: string[];
  bothLabel: string;
  firstRows: string[];
  secondRows: string[];
};

const MULTI_SELECT_FILTER_CASES: MultiSelectFilterCase[] = [
  {
    widget: "Transform",
    param: "transform-ids",
    firstOption: "MBQL transform",
    secondOption: "SQL transform",
    firstValues: [String(MBQL_TRANSFORM.id)],
    secondValues: [String(SQL_TRANSFORM.id)],
    bothValues: [String(SQL_TRANSFORM.id), String(MBQL_TRANSFORM.id)],
    bothLabel: "2 transforms",
    firstRows: ["MBQL transform"],
    secondRows: ["SQL transform"],
  },
  {
    widget: "Status",
    param: "statuses",
    firstOption: "Success",
    secondOption: "Failed",
    firstValues: ["succeeded"],
    secondValues: ["failed"],
    bothValues: ["succeeded", "failed"],
    bothLabel: "2 statuses",
    firstRows: ["MBQL transform"],
    secondRows: ["SQL transform"],
  },
  {
    widget: "Tags",
    param: "transform-tag-ids",
    firstOption: "tag1",
    secondOption: "tag2",
    firstValues: [String(TAG_1.id)],
    secondValues: [String(TAG_2.id)],
    bothValues: [String(TAG_2.id), String(TAG_1.id)],
    bothLabel: "2 tags",
    firstRows: ["MBQL transform"],
    secondRows: ["SQL transform"],
  },
  {
    widget: "Trigger",
    param: "run-methods",
    firstOption: "Manual",
    secondOption: "Schedule",
    firstValues: ["manual"],
    secondValues: ["cron"],
    bothValues: ["cron", "manual"],
    bothLabel: "Schedule, Manual",
    firstRows: BOTH,
    secondRows: [],
  },
];

async function expectRunsOrEmptyState(names: string[]) {
  if (names.length === 0) {
    expect(await screen.findByText("No runs found")).toBeInTheDocument();
    expect(screen.queryByText("MBQL transform")).not.toBeInTheDocument();
    expect(screen.queryByText("SQL transform")).not.toBeInTheDocument();
  } else {
    await expectRunNames(names);
    expect(screen.queryByText("No runs found")).not.toBeInTheDocument();
  }
}

describe("RunListPage filtering and sorting", () => {
  it.each(MULTI_SELECT_FILTER_CASES)(
    "adds, updates, extends and removes the $widget filter",
    async ({
      widget,
      param,
      firstOption,
      secondOption,
      firstValues,
      secondValues,
      bothValues,
      bothLabel,
      firstRows,
      secondRows,
    }) => {
      const { router } = setupWithFilters();
      await expectRunNames(BOTH);
      await expectLastRunsQuery({});

      let popover = await openFilter(widget);
      await userEvent.click(within(popover).getByText(firstOption));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );
      expect(
        within(getFilterWidget(widget)).getByText(firstOption),
      ).toBeInTheDocument();
      await expectLastRunsQuery({ [param]: firstValues });
      await expectRunsOrEmptyState(firstRows);

      popover = await openFilter(widget);
      await userEvent.click(within(popover).getByText(firstOption));
      await userEvent.click(within(popover).getByText(secondOption));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Update filter" }),
      );
      expect(
        within(getFilterWidget(widget)).getByText(secondOption),
      ).toBeInTheDocument();
      await expectLastRunsQuery({ [param]: secondValues });
      await expectRunsOrEmptyState(secondRows);

      popover = await openFilter(widget);
      await userEvent.click(within(popover).getByText(firstOption));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Update filter" }),
      );
      expect(
        within(getFilterWidget(widget)).getByText(bothLabel),
      ).toBeInTheDocument();
      await expectLastRunsQuery({ [param]: bothValues });
      await expectRunsOrEmptyState(BOTH);

      // Removing the filter goes back to the cached unfiltered list, so there
      // is no new request to check; the URL holds the filter state instead.
      await removeFilter(widget);
      expect(
        within(getFilterWidget(widget)).queryByText(bothLabel),
      ).not.toBeInTheDocument();
      expect(router?.location.search).toBe("");
      await expectRunsOrEmptyState(BOTH);
    },
  );

  it.each([
    { widget: "Started at", param: "start-time" },
    { widget: "Ended at", param: "end-time" },
  ])("filters runs by the $widget relative date", async ({ widget, param }) => {
    const { router } = setupWithFilters();
    await expectRunNames(BOTH);

    let popover = await openFilter(widget);
    await userEvent.click(within(popover).getByText("Today"));
    expect(
      within(getFilterWidget(widget)).getByText("Today"),
    ).toBeInTheDocument();
    await expectLastRunsQuery({ [param]: ["thisday"] });
    await expectRunsOrEmptyState(BOTH);

    await removeFilter(widget);
    popover = await openFilter(widget);
    await userEvent.click(within(popover).getByText("Relative date range…"));
    await userEvent.click(
      await within(popover).findByLabelText("Include today"),
    );
    await userEvent.click(
      within(popover).getByRole("button", { name: "Apply" }),
    );
    expect(
      within(getFilterWidget(widget)).getByText("Previous 30 days or today"),
    ).toBeInTheDocument();
    await expectLastRunsQuery({ [param]: ["past30days~"] });
    await expectRunsOrEmptyState(BOTH);

    await removeFilter(widget);
    popover = await openFilter(widget);
    await userEvent.click(within(popover).getByText("Previous week"));
    expect(
      within(getFilterWidget(widget)).getByText("Previous week"),
    ).toBeInTheDocument();
    await expectLastRunsQuery({ [param]: ["past1weeks"] });
    await expectRunsOrEmptyState([]);

    await removeFilter(widget);
    expect(router?.location.search).toBe("");
    await expectRunsOrEmptyState(BOTH);
  });

  it.each([
    {
      columnName: "Transform",
      sortColumn: "transform-name",
      ascending: ["MBQL transform", "SQL transform"],
    },
    {
      columnName: "Started at",
      sortColumn: "start-time",
      ascending: ["MBQL transform", "SQL transform"],
    },
    {
      columnName: "Ended at",
      sortColumn: "end-time",
      ascending: ["MBQL transform", "SQL transform"],
    },
    {
      columnName: "Status",
      sortColumn: "status",
      ascending: ["SQL transform", "MBQL transform"],
    },
    {
      columnName: "Trigger",
      sortColumn: "run-method",
      ascending: ["MBQL transform", "SQL transform"],
    },
    {
      columnName: "Tags",
      sortColumn: "transform-tags",
      ascending: ["MBQL transform", "SQL transform"],
    },
  ])(
    "sorts runs by $columnName on the server",
    async ({ columnName, sortColumn, ascending }) => {
      const { router } = setupWithFilters();
      await expectRunNames(BOTH);

      await userEvent.click(within(getRunTable()).getByText(columnName));
      await expectLastRunsQuery({
        "sort-column": [sortColumn],
        "sort-direction": ["asc"],
      });
      expect(router?.location.search).toBe(
        `?sort-column=${sortColumn}&sort-direction=asc`,
      );
      await expectRunNames(ascending);

      await userEvent.click(within(getRunTable()).getByText(columnName));
      await expectLastRunsQuery({
        "sort-column": [sortColumn],
        "sort-direction": ["desc"],
      });
      expect(router?.location.search).toBe(
        `?sort-column=${sortColumn}&sort-direction=desc`,
      );
      await expectRunNames([...ascending].reverse());
    },
  );
});
