import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupFieldEndpoints } from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { createMockField } from "metabase-types/api/mocks";

import { RescanFieldButton } from "./RescanFieldButton";

function setup() {
  const field = createMockField();

  setupFieldEndpoints(field);

  renderWithProviders(
    <>
      <RescanFieldButton fieldId={getRawTableFieldId(field)} />
      <UndoListing />
    </>,
  );

  return { field };
}

describe("RescanFieldButton", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  it("should show success message for 2 seconds", async () => {
    const { field } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Re-scan field");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/field/${field.id}/rescan_values`, {
        method: "POST",
      }),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Scan triggered!");
    });

    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(button).toHaveTextContent("Re-scan field");
  });

  it("resets success message timer after next click", async () => {
    const { field } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Re-scan field");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/field/${field.id}/rescan_values`, {
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
      fetchMock.callHistory.calls(`path:/api/field/${field.id}/rescan_values`, {
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

    expect(button).toHaveTextContent("Re-scan field");
  });

  it("should show error message toast", async () => {
    const { field } = setup();

    fetchMock.modifyRoute(`field-${field.id}-rescan-values`, {
      response: { status: 500 },
    });

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Re-scan field");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(`path:/api/field/${field.id}/rescan_values`, {
        method: "POST",
      }),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Re-scan field");
    });

    await waitFor(() => {
      const undo = screen.getByTestId("undo-list");
      expect(
        within(undo).getByText("Failed to start scan"),
      ).toBeInTheDocument();
    });
  });
});
