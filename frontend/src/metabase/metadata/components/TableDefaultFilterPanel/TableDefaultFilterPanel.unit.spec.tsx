import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockTable } from "metabase-types/api/mocks";

import { TableDefaultFilterPanel } from "./TableDefaultFilterPanel";

// SegmentFilterEditor relies on a fully-built Lib.Query and a metadata provider
// with tables/fields registered. We only care about the save/clear/render
// behaviour the panel itself owns; stub the editor so the tests are fast.
jest.mock("metabase/querying/segments/components/SegmentFilterEditor", () => ({
  SegmentFilterEditor: () => <div data-testid="mock-filter-editor" />,
}));

function setup(clause?: unknown[]) {
  fetchMock.put(/\/api\/table\/\d+$/, { status: 200, body: {} });
  const table = createMockTable({
    id: 42,
    db_id: 1,
    settings: clause === undefined ? null : { default_filter_clause: clause },
  });
  renderWithProviders(<TableDefaultFilterPanel table={table} />);
}

async function lastPutBody() {
  const call = fetchMock.callHistory.lastCall(/\/api\/table\/\d+$/);
  const clone = call?.request?.clone();
  return clone ? await clone.json() : {};
}

describe("TableDefaultFilterPanel", () => {
  afterEach(() => fetchMock.removeRoutes().clearHistory());

  it("renders the section heading and caveat copy", () => {
    setup();
    expect(screen.getByText("Default filter")).toBeInTheDocument();
    expect(
      screen.getByText(/display default, not a permissions control/),
    ).toBeInTheDocument();
  });

  it("renders the underlying filter editor", () => {
    setup();
    expect(screen.getByTestId("mock-filter-editor")).toBeInTheDocument();
  });

  it("disables 'Clear filter' when no clause is set", () => {
    setup();
    expect(screen.getByRole("button", { name: "Clear filter" })).toBeDisabled();
  });

  it("enables 'Clear filter' when a clause exists and sends null on click", async () => {
    const clause = ["=", ["field", 42, null], 4];
    setup(clause);

    const button = screen.getByRole("button", { name: "Clear filter" });
    expect(button).toBeEnabled();
    await userEvent.click(button);

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(/\/api\/table\/42$/).length,
      ).toBeGreaterThan(0),
    );
    expect(await lastPutBody()).toEqual({
      settings: { default_filter_clause: null },
    });
  });
});
