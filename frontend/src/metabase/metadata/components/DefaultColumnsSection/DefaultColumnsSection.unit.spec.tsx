import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { DefaultColumnsSection } from "./DefaultColumnsSection";

function setup() {
  fetchMock.put(/\/api\/field\/\d+$/, { status: 200, body: {} });

  const table = createMockTable({
    id: 1,
    fields: [
      createMockField({
        id: 11,
        name: "A",
        display_name: "A",
        visibility_type: "normal",
      }),
      createMockField({
        id: 12,
        name: "B",
        display_name: "B",
        visibility_type: "hidden-by-default",
      }),
      createMockField({
        id: 13,
        name: "C",
        display_name: "C",
        visibility_type: "details-only",
      }),
      createMockField({
        id: 14,
        name: "D",
        display_name: "D",
        visibility_type: "sensitive",
      }),
    ],
  });

  renderWithProviders(<DefaultColumnsSection table={table} />);
}

async function lastPutBody(idPattern: RegExp = /\/api\/field\/\d+$/) {
  const call = fetchMock.callHistory.lastCall(idPattern);
  const clone = call?.request?.clone();
  return clone ? await clone.json() : {};
}

describe("DefaultColumnsSection", () => {
  afterEach(() => fetchMock.removeRoutes().clearHistory());

  it("renders one checkbox per field with correct initial state", async () => {
    setup();

    const a = screen.getByRole("checkbox", { name: /Show A by default/ });
    const b = screen.getByRole("checkbox", { name: /Show B by default/ });
    const c = screen.getByRole("checkbox", { name: /Show C by default/ });
    const d = screen.getByRole("checkbox", { name: /Show D by default/ });

    expect(a).toBeChecked();
    expect(b).not.toBeChecked();
    expect(c).toBeDisabled();
    expect(d).toBeDisabled();
  });

  it("summary shows shown/total count for toggleable fields", async () => {
    setup();
    // 2 toggleable fields (A, B), 1 shown (A)
    expect(screen.getByText("1 of 2 shown")).toBeInTheDocument();
  });

  it("unchecking a 'normal' field sends visibility_type='hidden-by-default'", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Show A by default/ }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(/\/api\/field\/11$/).length,
      ).toBeGreaterThan(0),
    );
    expect(await lastPutBody()).toEqual({
      visibility_type: "hidden-by-default",
    });
  });

  it("checking a 'hidden-by-default' field sends visibility_type='normal'", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Show B by default/ }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(/\/api\/field\/12$/).length,
      ).toBeGreaterThan(0),
    );
    expect(await lastPutBody()).toEqual({ visibility_type: "normal" });
  });

  it("'Hide all' flips every normal field to hidden-by-default; skips already-hidden and non-toggleable", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Hide all" }));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(/\/api\/field\/11$/).length,
      ).toBeGreaterThan(0),
    );
    const calls = fetchMock.callHistory.calls(/\/api\/field\/\d+$/);
    const ids = calls.map((c) => c.url.match(/field\/(\d+)$/)?.[1]);
    expect(ids).toEqual(expect.arrayContaining(["11"]));
    expect(ids).toHaveLength(1);
    // non-toggleable rows (details-only, sensitive) must NOT be touched
    expect(ids).not.toContain("13");
    expect(ids).not.toContain("14");
    expect(await lastPutBody()).toEqual({
      visibility_type: "hidden-by-default",
    });
  });

  it("'Show all' flips every hidden-by-default field to normal", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Show all" }));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(/\/api\/field\/12$/).length,
      ).toBeGreaterThan(0),
    );
    const calls = fetchMock.callHistory.calls(/\/api\/field\/\d+$/);
    const ids = calls.map((c) => c.url.match(/field\/(\d+)$/)?.[1]);
    expect(ids).toEqual(expect.arrayContaining(["12"]));
    expect(ids).toHaveLength(1);
    expect(await lastPutBody()).toEqual({ visibility_type: "normal" });
  });

  it("bulk operation is a no-op when no field needs changing", async () => {
    const table = createMockTable({
      id: 2,
      fields: [
        createMockField({
          id: 21,
          name: "X",
          display_name: "X",
          visibility_type: "normal",
        }),
      ],
    });
    fetchMock.put(/\/api\/field\/\d+$/, { status: 200, body: {} });
    renderWithProviders(<DefaultColumnsSection table={table} />);

    await userEvent.click(screen.getByRole("button", { name: "Show all" }));

    expect(fetchMock.callHistory.calls(/\/api\/field\/\d+$/)).toHaveLength(0);
  });

  it("keeps the checkbox toggleable when an update returns 500", async () => {
    fetchMock.put(/\/api\/field\/\d+$/, 500);

    const table = createMockTable({
      id: 3,
      fields: [
        createMockField({
          id: 31,
          name: "N",
          display_name: "N",
          visibility_type: "normal",
        }),
      ],
    });
    renderWithProviders(<DefaultColumnsSection table={table} />);

    const checkbox = screen.getByRole("checkbox", {
      name: /Show N by default/,
    });
    await userEvent.click(checkbox);

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(/\/api\/field\/31$/).length,
      ).toBeGreaterThan(0),
    );
    // After the failed PUT the row must become interactive again (pending cleared).
    await waitFor(() => expect(checkbox).toBeEnabled());
  });
});
