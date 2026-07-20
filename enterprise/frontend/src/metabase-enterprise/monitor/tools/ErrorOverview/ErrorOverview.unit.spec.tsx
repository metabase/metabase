import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { RowValue } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { ErrorOverview } from "./ErrorOverview";
import { createMockErroringCard } from "./mocks";
import { type ErroringCard, SORT_COLUMNS } from "./types";
import { PAGE_SIZE } from "./utils";

const COLUMN_NAMES = ["card_id", ...SORT_COLUMNS];
const SEARCH_PLACEHOLDER = "Search by question, error, database, or collection";

function createDatasetResponse(cards: Partial<ErroringCard>[], total?: number) {
  const fullCards = cards.map(createMockErroringCard);
  const rows: RowValue[][] = fullCards.map((card) => [
    card.id,
    card.card_name,
    card.error_substr,
    card.collection_name,
    card.database_name,
    card.schema_name,
    card.table_name,
    card.last_run_at,
    card.total_runs,
    card.num_dashboards,
    card.user_name,
    card.updated_at,
  ]);

  return {
    ...createMockDataset({
      data: createMockDatasetData({
        cols: COLUMN_NAMES.map((name) => createMockColumn({ name })),
        rows,
      }),
      row_count: rows.length,
    }),
    total_count: total ?? cards.length,
  };
}

const getDatasetCalls = () => fetchMock.callHistory.calls("path:/api/dataset");

async function getLastDatasetQuery() {
  const calls = getDatasetCalls();
  const call = calls[calls.length - 1];
  return JSON.parse(String(await call.options.body));
}

type SetupOpts = {
  cards?: Partial<ErroringCard>[];
  total?: number;
  error?: boolean;
  initialRoute?: string;
};

async function setup({
  cards = [{ id: 1 }],
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
    fetchMock.post("path:/api/dataset", createDatasetResponse(cards, total));
  }

  const utils = renderWithProviders(
    <Route path="/" element={<ErrorOverview />} />,
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
      cards: [
        {
          id: 1,
          card_name: "Broken question",
          error_substr: "Table not found...",
        },
      ],
    });

    const query = await getLastDatasetQuery();
    expect(query.type).toBe("internal");
    expect(query.fn).toBe(
      "metabase-enterprise.audit-app.pages.queries/bad-table",
    );
    expect(query.args).toEqual(["", "last_run_at", "desc"]);
    expect(query.limit).toBe(PAGE_SIZE);
    expect(query.offset).toBe(0);
    // the QP schema rejects an explicit null database; the key must be absent
    expect("database" in query).toBe(false);

    const row = await screen.findByTestId("erroring-question");
    expect(within(row).getByText("Broken question")).toBeInTheDocument();
    expect(within(row).getByText("Table not found...")).toBeInTheDocument();
    expect(within(row).getByText("Our Analytics")).toBeInTheDocument();
    expect(within(row).getByText("Sample Database")).toBeInTheDocument();

    expect(getDatasetCalls()).toHaveLength(1);
    expect(
      screen.queryByRole("navigation", { name: "pagination" }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no erroring questions", async () => {
    await setup({ cards: [] });

    expect(await screen.findByText("No results")).toBeInTheDocument();
  });

  it("shows the error message when the audit query fails", async () => {
    await setup({ error: true });

    expect(await screen.findByText("Audit query failed")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(SEARCH_PLACEHOLDER),
    ).not.toBeInTheDocument();
  });

  it("surfaces an internal-query error returned in the dataset body", async () => {
    mockGetBoundingClientRect({ width: 100, height: 100 });
    // the /api/dataset call succeeds at the HTTP layer but the internal audit
    // query failed - dataset.error is present.
    fetchMock.post(
      "path:/api/dataset",
      createMockDataset({
        status: "failed",
        error: "Internal audit query blew up",
      }),
    );

    renderWithProviders(<Route path="/" element={<ErrorOverview />} />, {
      withRouter: true,
    });

    expect(
      await screen.findByText("Internal audit query blew up"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(SEARCH_PLACEHOLDER),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("erroring-questions-table"),
    ).not.toBeInTheDocument();
  });

  it("passes filter values to the query and resets to the first page", async () => {
    const { history } = await setup({
      cards: Array.from({ length: PAGE_SIZE }, (_, index) => ({
        id: index + 1,
      })),
      total: 120,
      initialRoute: "/?page=2",
    });

    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.offset).toBe(PAGE_SIZE * 2);
    });

    const rows = await screen.findAllByTestId("erroring-question");
    await userEvent.click(within(rows[0]).getByLabelText("Select row"));
    expect(await screen.findByText("1 question selected")).toBeInTheDocument();

    await userEvent.type(
      await screen.findByPlaceholderText(SEARCH_PLACEHOLDER),
      "timeout",
    );
    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.args).toEqual(["timeout", "last_run_at", "desc"]);
    });

    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.offset).toBe(0);
    });
    await waitFor(() => {
      expect(history?.getCurrentLocation().search).toBe("");
    });
    expect(screen.queryByText("1 question selected")).not.toBeInTheDocument();
  });

  it("sorts by column with asc/desc toggle, reverting to the default sort on the 3rd click", async () => {
    await setup();
    await screen.findByTestId("erroring-question");

    await userEvent.click(
      screen.getByRole("columnheader", { name: /Question/ }),
    );
    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.args.slice(1)).toEqual(["card_name", "asc"]);
    });

    await userEvent.click(
      screen.getByRole("columnheader", { name: /Question/ }),
    );
    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.args.slice(1)).toEqual(["card_name", "desc"]);
    });

    await userEvent.click(
      screen.getByRole("columnheader", { name: /Question/ }),
    );
    await waitFor(async () => {
      const query = await getLastDatasetQuery();
      expect(query.args.slice(1)).toEqual(["last_run_at", "desc"]);
    });
  });

  it("reruns the selected questions from the bulk action bar and clears the selection", async () => {
    fetchMock.post("express:/api/card/:cardId/query", createMockDataset());
    await setup({ cards: [{ id: 7 }, { id: 8 }] });

    const rows = await screen.findAllByTestId("erroring-question");
    await userEvent.click(within(rows[0]).getByLabelText("Select row"));
    expect(await screen.findByText("1 question selected")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Select all"));
    expect(await screen.findByText("2 questions selected")).toBeInTheDocument();

    const datasetCallsBefore = getDatasetCalls().length;
    await userEvent.click(
      screen.getByRole("button", { name: "Rerun selected" }),
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
    // the list is refetched exactly once after both reruns settle
    await waitFor(() => {
      expect(getDatasetCalls().length).toBe(datasetCallsBefore + 1);
    });
  });

  it("recovers when one of the bulk rerun requests fails", async () => {
    mockGetBoundingClientRect({ width: 100, height: 100 });
    fetchMock.post("express:/api/card/7/query", {
      status: 500,
      body: { message: "rerun failed" },
    });
    fetchMock.post("express:/api/card/8/query", createMockDataset());

    // the list reflects backend state: both cards error at first, but after the
    // reruns card 8 succeeds (drops off bad-table) while card 7 fails (stays).
    let rerunsAttempted = false;
    fetchMock.post("path:/api/dataset", () =>
      createDatasetResponse(
        rerunsAttempted ? [{ id: 7 }] : [{ id: 7 }, { id: 8 }],
      ),
    );

    renderWithProviders(<Route path="/" element={<ErrorOverview />} />, {
      withRouter: true,
    });

    expect(await screen.findAllByTestId("erroring-question")).toHaveLength(2);
    await userEvent.click(screen.getByLabelText("Select all"));
    expect(await screen.findByText("2 questions selected")).toBeInTheDocument();

    // from here on the refetch should see card 8 healthy
    rerunsAttempted = true;

    await userEvent.click(
      screen.getByRole("button", { name: "Rerun selected" }),
    );

    // both endpoints are attempted even though one fails
    await waitFor(() => {
      const rerunCalls = fetchMock.callHistory.calls(
        "express:/api/card/:cardId/query",
      );
      expect(rerunCalls).toHaveLength(2);
    });

    // the bulk actions bar tears down: selection clears and the button disappears
    // rather than staying stuck disabled
    await waitFor(() => {
      expect(
        screen.queryByText("2 questions selected"),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Rerun selected" }),
    ).not.toBeInTheDocument();

    // and the refetched table reflects reality: the successfully-rerun question
    // (8) drops off, the one whose rerun failed (7) remains
    await waitFor(() => {
      expect(screen.queryByText("Question 8")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Question 7")).toBeInTheDocument();
    expect(screen.getAllByTestId("erroring-question")).toHaveLength(1);
  });

  it("shows a per-row loader while a rerun runs, freeing the bar to queue more", async () => {
    mockGetBoundingClientRect({ width: 100, height: 100 });

    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };
    const card7 = deferred();
    const card8 = deferred();
    fetchMock.post("express:/api/card/7/query", () =>
      card7.promise.then(() => createMockDataset()),
    );
    fetchMock.post("express:/api/card/8/query", () =>
      card8.promise.then(() => createMockDataset()),
    );

    await setup({ cards: [{ id: 7 }, { id: 8 }] });

    const rowAt = (index: number) =>
      screen.getAllByTestId("erroring-question")[index];

    // rerun question 7 only
    await userEvent.click(within(rowAt(0)).getByLabelText("Select row"));
    await userEvent.click(
      screen.getByRole("button", { name: "Rerun selected" }),
    );

    // the bulk bar closes immediately, even though 7's request is still pending
    await waitFor(() => {
      expect(screen.queryByText("1 question selected")).not.toBeInTheDocument();
    });

    // 7 shows a loader in place of its checkbox; 8 is untouched
    await waitFor(() => {
      expect(within(rowAt(0)).getByLabelText("Loading")).toBeInTheDocument();
    });
    expect(
      within(rowAt(0)).queryByLabelText("Select row"),
    ).not.toBeInTheDocument();
    expect(within(rowAt(1)).getByLabelText("Select row")).toBeInTheDocument();

    // the bar is free: question 8 can be queued while 7 is still running
    await userEvent.click(within(rowAt(1)).getByLabelText("Select row"));
    await userEvent.click(
      screen.getByRole("button", { name: "Rerun selected" }),
    );
    await waitFor(() => {
      expect(within(rowAt(1)).getByLabelText("Loading")).toBeInTheDocument();
    });

    // resolving 7 clears only its loader; 8 keeps running
    card7.resolve();
    await waitFor(() => {
      expect(
        within(rowAt(0)).queryByLabelText("Loading"),
      ).not.toBeInTheDocument();
    });
    expect(within(rowAt(1)).getByLabelText("Loading")).toBeInTheDocument();

    card8.resolve();
    await waitFor(() => {
      expect(
        within(rowAt(1)).queryByLabelText("Loading"),
      ).not.toBeInTheDocument();
    });
  });

  it("excludes rerunning rows from select all", async () => {
    mockGetBoundingClientRect({ width: 100, height: 100 });

    let resolveCard7!: () => void;
    const card7 = new Promise<void>((resolve) => {
      resolveCard7 = resolve;
    });
    fetchMock.post("express:/api/card/7/query", () =>
      card7.then(() => createMockDataset()),
    );

    await setup({ cards: [{ id: 7 }, { id: 8 }, { id: 9 }] });

    const rowAt = (index: number) =>
      screen.getAllByTestId("erroring-question")[index];

    // rerun question 7 -> it starts loading and is no longer selectable
    await userEvent.click(within(rowAt(0)).getByLabelText("Select row"));
    await userEvent.click(
      screen.getByRole("button", { name: "Rerun selected" }),
    );
    await waitFor(() => {
      expect(within(rowAt(0)).getByLabelText("Loading")).toBeInTheDocument();
    });

    // select all picks the two idle rows, skipping the rerunning one
    await userEvent.click(screen.getByLabelText("Select all"));
    expect(await screen.findByText("2 questions selected")).toBeInTheDocument();

    resolveCard7();
    await waitFor(() => {
      expect(
        within(rowAt(0)).queryByLabelText("Loading"),
      ).not.toBeInTheDocument();
    });
  });

  it("paginates showing the total count and syncs the page to the URL", async () => {
    const { history } = await setup({
      cards: Array.from({ length: PAGE_SIZE }, (_, index) => ({
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
      cards: Array.from({ length: PAGE_SIZE }, (_, index) => ({
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

  it("links each row to the question and navigates there on click", async () => {
    const { history } = await setup({ cards: [{ id: 42 }] });

    await screen.findByTestId("erroring-question");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/question/42");

    await userEvent.click(link);
    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe("/question/42");
    });
  });

  it("does not navigate in the current tab on cmd/shift-click, leaving it to the native link", async () => {
    const { history } = await setup({ cards: [{ id: 42 }] });

    await screen.findByTestId("erroring-question");
    const link = screen.getByRole("link");
    const startingPathname = history?.getCurrentLocation().pathname;

    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { shiftKey: true });

    expect(history?.getCurrentLocation().pathname).toBe(startingPathname);
  });

  it("navigates to the question when activated from the keyboard", async () => {
    const { history } = await setup({ cards: [{ id: 42 }] });

    await screen.findByTestId("erroring-question");
    screen.getByRole("treegrid", { name: "Erroring questions" }).focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe("/question/42");
    });
  });

  it("selects the focused checkbox's row via space, even when a different row is keyboard-highlighted", async () => {
    await setup({ cards: [{ id: 1 }, { id: 2 }] });
    const rows = await screen.findAllByTestId("erroring-question");

    // highlight the first row via arrow-key
    screen.getByRole("treegrid", { name: "Erroring questions" }).focus();
    await userEvent.keyboard("{ArrowDown}");

    //focus the second row's checkbox directly
    within(rows[1]).getByLabelText("Select row").focus();
    await userEvent.keyboard(" ");

    expect(await screen.findByText("1 question selected")).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText("Deselect row")).toBeChecked();
  });

  it("selects the keyboard-highlighted row via space when no checkbox is focused", async () => {
    await setup({ cards: [{ id: 42 }] });
    const row = await screen.findByTestId("erroring-question");

    screen.getByRole("treegrid", { name: "Erroring questions" }).focus();
    await userEvent.keyboard("{ArrowDown} ");

    expect(await screen.findByText("1 question selected")).toBeInTheDocument();
    expect(within(row).getByLabelText("Deselect row")).toBeChecked();
  });
});
