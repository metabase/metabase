import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupTableEndpoints,
  setupTablesBulkEndpoints,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockTable } from "metabase-types/api/mocks";

import { RescanTableFieldsButton } from "./RescanTableFieldsButton";

function setup() {
  const user = userEvent.setup({
    advanceTimers: async (delay) => {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(delay);
      });
    },
    writeToClipboard: false,
  });
  const table = createMockTable();

  setupTableEndpoints(table);
  setupTablesBulkEndpoints();

  renderWithProviders(
    <>
      <RescanTableFieldsButton tableIds={[table.id]} />
      <UndoListing />
    </>,
  );

  return { table, user };
}

describe("RescanTableFieldsButton", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  it("should show success message for 2 seconds", async () => {
    const { table, user } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Re-scan table");

    await user.click(button);
    const calls = fetchMock.callHistory.calls(
      `path:/api/data-studio/table/rescan-values`,
      {
        method: "POST",
      },
    );
    expect(calls).toHaveLength(1);
    // Unjustified type cast. FIXME
    expect(JSON.parse(calls[0].options.body as string)).toEqual({
      table_ids: [table.id],
    });
    await waitFor(() => {
      expect(button).toHaveTextContent("Scan triggered!");
    });

    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(button).toHaveTextContent("Re-scan table");
  });

  it("resets success message timer after next click", async () => {
    const { table, user } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Re-scan table");

    await user.click(button);
    let calls = fetchMock.callHistory.calls(
      `path:/api/data-studio/table/rescan-values`,
      {
        method: "POST",
      },
    );
    expect(calls).toHaveLength(1);
    // Unjustified type cast. FIXME
    expect(JSON.parse(calls[0].options.body as string)).toEqual({
      table_ids: [table.id],
    });
    await waitFor(() => {
      expect(button).toHaveTextContent("Scan triggered!");
    });

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Scan triggered!");
    await user.click(button);
    calls = fetchMock.callHistory.calls(
      `path:/api/data-studio/table/rescan-values`,
      {
        method: "POST",
      },
    );
    expect(calls).toHaveLength(2);
    // Unjustified type cast. FIXME
    expect(JSON.parse(calls[1].options.body as string)).toEqual({
      table_ids: [table.id],
    });

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Scan triggered!");

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Re-scan table");
  });

  it("should show error message toast", async () => {
    const { table, user } = setup();

    fetchMock.modifyRoute("tables-rescan-values", {
      response: { status: 500 },
    });

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Re-scan table");

    await user.click(button);
    const calls = fetchMock.callHistory.calls(
      `path:/api/data-studio/table/rescan-values`,
      {
        method: "POST",
      },
    );
    expect(calls).toHaveLength(1);
    // Unjustified type cast. FIXME
    expect(JSON.parse(calls[0].options.body as string)).toEqual({
      table_ids: [table.id],
    });
    await waitFor(() => {
      expect(button).toHaveTextContent("Re-scan table");
    });

    await waitFor(() => {
      const undo = screen.getByTestId("undo-list");
      expect(
        within(undo).getByText("Failed to start scan"),
      ).toBeInTheDocument();
    });
  });
});
