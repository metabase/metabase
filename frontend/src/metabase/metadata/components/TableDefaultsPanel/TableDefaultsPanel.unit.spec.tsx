import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockTable } from "metabase-types/api/mocks";

import { TableDefaultsPanel } from "./TableDefaultsPanel";

function setup(limit?: number | null) {
  fetchMock.put(/\/api\/table\/\d+$/, { status: 200, body: {} });

  const table = createMockTable({
    id: 7,
    settings: limit === undefined ? null : { default_row_limit: limit },
  });
  renderWithProviders(<TableDefaultsPanel table={table} />);
}

async function lastPutBody() {
  const call = fetchMock.callHistory.lastCall(/\/api\/table\/\d+$/);
  const clone = call?.request?.clone();
  return clone ? await clone.json() : {};
}

describe("TableDefaultsPanel", () => {
  afterEach(() => fetchMock.removeRoutes().clearHistory());

  it("renders the persisted default row limit", () => {
    setup(250);

    const input = screen.getByLabelText("Default row limit");
    expect(input).toHaveValue("250");
  });

  it("renders empty when no default is set", () => {
    setup();

    const input = screen.getByLabelText("Default row limit");
    expect(input).toHaveValue("");
  });

  it("sends PUT with the typed value after debounce", async () => {
    setup();

    const input = screen.getByLabelText("Default row limit");
    await userEvent.type(input, "100");

    await waitFor(
      () =>
        expect(
          fetchMock.callHistory.calls(/\/api\/table\/7$/).length,
        ).toBeGreaterThan(0),
      { timeout: 2000 },
    );
    expect(await lastPutBody()).toEqual({
      settings: { default_row_limit: 100 },
    });
  });

  it("clears the default when the input is emptied", async () => {
    setup(250);

    const input = screen.getByLabelText("Default row limit");
    await userEvent.clear(input);

    await waitFor(
      () =>
        expect(
          fetchMock.callHistory.calls(/\/api\/table\/7$/).length,
        ).toBeGreaterThan(0),
      { timeout: 2000 },
    );
    expect(await lastPutBody()).toEqual({
      settings: { default_row_limit: null },
    });
  });

  it("disables the input while a save is in flight", async () => {
    fetchMock.put(
      /\/api\/table\/\d+$/,
      new Promise((resolve) =>
        setTimeout(() => resolve({ status: 200, body: {} }), 1000),
      ),
    );
    const table = createMockTable({ id: 8 });
    renderWithProviders(<TableDefaultsPanel table={table} />);

    const input = screen.getByLabelText("Default row limit");
    await userEvent.type(input, "100");

    // While the server hangs, the input becomes disabled.
    await waitFor(() => expect(input).toBeDisabled(), { timeout: 2000 });
  });

  it("rolls back the input when the server returns 500", async () => {
    fetchMock.put(/\/api\/table\/\d+$/, 500);

    const table = createMockTable({
      id: 9,
      settings: { default_row_limit: 250 },
    });
    renderWithProviders(<TableDefaultsPanel table={table} />);

    const input = screen.getByLabelText("Default row limit");
    await userEvent.clear(input);
    await userEvent.type(input, "500");

    // After the PUT fails the input should be re-enabled and revert to 250.
    await waitFor(() => expect(input).toHaveValue("250"), { timeout: 2000 });
    expect(input).toBeEnabled();
  });
});
