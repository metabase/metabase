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

import { SyncTableSchemaButton } from "./SyncTableSchemaButton";

function setup() {
  const table = createMockTable();

  setupTableEndpoints(table);

  renderWithProviders(
    <>
      <SyncTableSchemaButton tableId={table.id} />
      <UndoListing />
    </>,
  );

  return { table };
}

describe("SyncTableSchemaButton", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  it("should show success message for 2 seconds", async () => {
    const { table } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Sync table schema");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${table.id}/sync_schema`, {
        method: "POST",
      }),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Sync triggered!");
    });

    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(button).toHaveTextContent("Sync table schema");
  });

  it("resets success message timer after next click", async () => {
    const { table } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Sync table schema");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${table.id}/sync_schema`, {
        method: "POST",
      }),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Sync triggered!");
    });

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Sync triggered!");
    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${table.id}/sync_schema`, {
        method: "POST",
      }),
    ).toHaveLength(2);

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Sync triggered!");

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Sync table schema");
  });

  it("should show error message toast", async () => {
    const { table } = setup();

    fetchMock.modifyRoute(`table-${table.id}-sync-schema`, {
      response: { status: 500 },
    });

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Sync table schema");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${table.id}/sync_schema`, {
        method: "POST",
      }),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Sync table schema");
    });

    await waitFor(() => {
      const undo = screen.getByTestId("undo-list");
      expect(
        within(undo).getByText("Failed to start sync"),
      ).toBeInTheDocument();
    });
  });
});
