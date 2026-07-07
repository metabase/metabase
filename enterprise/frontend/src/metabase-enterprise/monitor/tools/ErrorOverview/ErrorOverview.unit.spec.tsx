import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { ErrorOverview } from "./ErrorOverview";
import { PAGE_SIZE } from "./utils";

type QuestionRow = {
  id: number;
  name?: string;
  error?: string;
  collectionName?: string | null;
  databaseName?: string | null;
  lastRunAt?: string | null;
};

const COLUMN_NAMES = [
  "card_id",
  "card_name",
  "error_substr",
  "collection_name",
  "database_name",
  "schema_name",
  "table_name",
  "last_run_at",
  "total_runs",
  "num_dashboards",
  "user_name",
  "updated_at",
];

function createDatasetResponse(questions: QuestionRow[]) {
  const rows: RowValue[][] = questions.map((question) => [
    question.id,
    question.name ?? `Question ${question.id}`,
    question.error ?? "Syntax error...",
    question.collectionName ?? "Our Analytics",
    question.databaseName ?? "Sample Database",
    "PUBLIC",
    "ORDERS",
    question.lastRunAt ?? "2026-07-01T10:00:00Z",
    10,
    2,
    "John Doe",
    "2026-06-30T10:00:00Z",
  ]);

  return createMockDataset({
    data: createMockDatasetData({
      cols: COLUMN_NAMES.map((name) => createMockColumn({ name })),
      rows,
    }),
    row_count: rows.length,
  });
}

const ROWS_FN = "metabase-enterprise.audit-app.pages.queries/bad-table";
const COUNT_FN = "metabase-enterprise.audit-app.pages.queries/bad-table-count";

function createCountResponse(total: number) {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [createMockColumn({ name: "count" })],
      rows: [[total]],
    }),
    row_count: 1,
  });
}

const getDatasetCalls = () => fetchMock.callHistory.calls("path:/api/dataset");

async function getDatasetQueries(fn: string) {
  const bodies = await Promise.all(
    getDatasetCalls().map(async (call) =>
      JSON.parse(String(await call.options.body)),
    ),
  );
  return bodies.filter((body) => body.fn === fn);
}

async function getLastDatasetQuery(fn: string = ROWS_FN) {
  const queries = await getDatasetQueries(fn);
  return queries[queries.length - 1];
}

type SetupOpts = {
  questions?: QuestionRow[];
  total?: number;
  error?: boolean;
  initialRoute?: string;
};

async function setup({
  questions = [{ id: 1 }],
  total,
  error,
  initialRoute = "/",
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 100, height: 100 });

  if (error) {
    fetchMock.post("path:/api/dataset", {
      status: 500,
      body: { message: "Audit query failed" },
    });
  } else {
    fetchMock.post("path:/api/dataset", (call) => {
      const body = JSON.parse(String(call.options.body));
      return body.fn === COUNT_FN
        ? createCountResponse(total ?? questions.length)
        : createDatasetResponse(questions);
    });
  }

  const utils = renderWithProviders(
    <Route path="/" component={ErrorOverview} />,
    { withRouter: true, initialRoute },
  );

  if (!error) {
    await waitFor(() => {
      expect(getDatasetCalls().length).toBeGreaterThan(0);
    });
  }

  return utils;
}

describe("ErrorOverview", () => {
  it("fetches the audit bad-table query with default sorting and renders the results", async () => {
    await setup({
      questions: [
        { id: 1, name: "Broken question", error: "Table not found..." },
      ],
    });

    const query = await getLastDatasetQuery();
    expect(query.type).toBe("internal");
    expect(query.fn).toBe(
      "metabase-enterprise.audit-app.pages.queries/bad-table",
    );
    expect(query.args).toEqual(["", "", "", "last_run_at", "desc"]);
    expect(query.limit).toBe(PAGE_SIZE);
    expect(query.offset).toBe(0);
    // the QP schema rejects an explicit null database; the key must be absent
    expect("database" in query).toBe(false);

    const row = await screen.findByTestId("erroring-question");
    expect(within(row).getByText("Broken question")).toBeInTheDocument();
    expect(within(row).getByText("Table not found...")).toBeInTheDocument();
    expect(within(row).getByText("Our Analytics")).toBeInTheDocument();
    expect(within(row).getByText("Sample Database")).toBeInTheDocument();

    // a companion unpaged count query powers the pagination total
    await waitFor(async () => {
      expect(await getLastDatasetQuery(COUNT_FN)).toBeDefined();
    });
    const countQuery = await getLastDatasetQuery(COUNT_FN);
    expect(countQuery.args).toEqual(["", "", ""]);
    expect("limit" in countQuery).toBe(false);

    // single page of results → pagination is hidden
    expect(
      screen.queryByRole("navigation", { name: "pagination" }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no erroring questions", async () => {
    await setup({ questions: [] });

    expect(await screen.findByText("No results")).toBeInTheDocument();
  });

  it("shows the error message when the audit query fails", async () => {
    await setup({ error: true });

    expect(await screen.findByText("Audit query failed")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Error contents"),
    ).not.toBeInTheDocument();
  });

  it("passes debounced filter values to the query and resets the page", async () => {
    await setup();

    await userEvent.type(
      await screen.findByPlaceholderText("Error contents"),
      "timeout",
    );
    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.args[0]).toBe("timeout");
    });

    await userEvent.type(screen.getByPlaceholderText("DB name"), "pg");
    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.args).toEqual(["timeout", "pg", "", "last_run_at", "desc"]);
    });
    await waitFor(async () => {
      const countQuery = await getLastDatasetQuery(COUNT_FN);
      expect(countQuery.args).toEqual(["timeout", "pg", ""]);
    });
  });

  it("sorts by column with a 2-state asc/desc toggle", async () => {
    await setup();
    await screen.findByTestId("erroring-question");

    await userEvent.click(
      screen.getByRole("columnheader", { name: /Question/ }),
    );
    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.args.slice(3)).toEqual(["card_name", "asc"]);
    });

    await userEvent.click(
      screen.getByRole("columnheader", { name: /Question/ }),
    );
    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.args.slice(3)).toEqual(["card_name", "desc"]);
    });

    // clicking the non-default direction again flips back instead of un-sorting
    await userEvent.click(
      screen.getByRole("columnheader", { name: /Question/ }),
    );
    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.args.slice(3)).toEqual(["card_name", "asc"]);
    });
  });

  it("reruns the selected questions from the bulk action bar and clears the selection", async () => {
    fetchMock.post("express:/api/card/:cardId/query", createMockDataset());
    await setup({ questions: [{ id: 7 }, { id: 8 }] });

    const rows = await screen.findAllByTestId("erroring-question");
    await userEvent.click(within(rows[0]).getByLabelText("Select row"));
    expect(await screen.findByText("1 question selected")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Select all"));
    expect(await screen.findByText("2 questions selected")).toBeInTheDocument();

    const datasetCallsBefore = getDatasetCalls().length;
    await userEvent.click(
      screen.getByRole("button", { name: "Rerun Selected" }),
    );

    await waitFor(() => {
      const rerunCalls = fetchMock.callHistory.calls(
        "express:/api/card/:cardId/query",
      );
      expect(rerunCalls).toHaveLength(2);
    });
    const rerunUrls = fetchMock.callHistory
      .calls("express:/api/card/:cardId/query")
      .map((call) => call.url);
    expect(rerunUrls.some((url) => url.includes("/api/card/7/query"))).toBe(
      true,
    );
    expect(rerunUrls.some((url) => url.includes("/api/card/8/query"))).toBe(
      true,
    );

    await waitFor(() => {
      expect(
        screen.queryByText("2 questions selected"),
      ).not.toBeInTheDocument();
    });
    // the list is refetched after the rerun
    await waitFor(() => {
      expect(getDatasetCalls().length).toBeGreaterThan(datasetCallsBefore);
    });
  });

  it("paginates outside the table showing the total count and syncs the page to the URL", async () => {
    const { history } = await setup({
      questions: Array.from({ length: PAGE_SIZE }, (_, index) => ({
        id: index + 1,
      })),
      total: 120,
    });

    expect(await screen.findByTestId("pagination-total")).toHaveTextContent(
      "120",
    );
    await screen.findAllByTestId("erroring-question");

    const nextButton = await screen.findByLabelText("Next page");
    await userEvent.click(nextButton);

    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.offset).toBe(PAGE_SIZE);
    });
    await waitFor(() => {
      expect(history?.getCurrentLocation().search).toBe("?page=1");
    });
  });

  it("reads the initial page from the URL", async () => {
    await setup({
      questions: Array.from({ length: PAGE_SIZE }, (_, index) => ({
        id: index + 1,
      })),
      total: 120,
      initialRoute: "/?page=2",
    });

    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.offset).toBe(PAGE_SIZE * 2);
    });
  });

  it("navigates to the question when a row is clicked", async () => {
    const { history } = await setup({ questions: [{ id: 42 }] });

    await userEvent.click(await screen.findByTestId("erroring-question"));

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe("/question/42");
    });
  });
});
