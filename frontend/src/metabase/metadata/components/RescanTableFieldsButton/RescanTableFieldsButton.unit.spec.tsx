import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableEndpoints } from "__support__/server-mocks";
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
  const table = createMockTable();

  setupTableEndpoints(table);

  renderWithProviders(
    <>
      <RescanTableFieldsButton tableId={table.id} />
      <UndoListing />
    </>,
  );

  return { table };
}

describe("RescanTableFieldsButton", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  it("should show success message for 2 seconds", async () => {
    const { table } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Re-scan table");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${table.id}/rescan_values`, {
        method: "POST",
      }),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Scan triggered!");
    });

    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(button).toHaveTextContent("Re-scan table");
  });

  it("resets success message timer after next click", async () => {
    const { table } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Re-scan table");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${table.id}/rescan_values`, {
        method: "POST",
      }),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Scan triggered!");
    });

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Scan triggered!");
    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${table.id}/rescan_values`, {
        method: "POST",
      }),
    ).toHaveLength(2);

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
    const { table } = setup();

    fetchMock.modifyRoute(`table-${table.id}-rescan-values`, {
      response: { status: 500 },
    });

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Re-scan table");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${table.id}/rescan_values`, {
        method: "POST",
      }),
    ).toHaveLength(1);
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
