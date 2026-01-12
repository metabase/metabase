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

import { DiscardFieldValuesButton } from "./DiscardFieldValuesButton";

function setup() {
  const field = createMockField();

  setupFieldEndpoints(field);

  renderWithProviders(
    <>
      <DiscardFieldValuesButton fieldId={getRawTableFieldId(field)} />
      <UndoListing />
    </>,
  );

  return { field };
}

describe("DiscardFieldValuesButton", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  it("should show success message for 2 seconds", async () => {
    const { field } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Discard cached field values");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(
        `path:/api/field/${field.id}/discard_values`,
        {
          method: "POST",
        },
      ),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Discard triggered!");
    });

    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(button).toHaveTextContent("Discard cached field values");
  });

  it("resets success message timer after next click", async () => {
    const { field } = setup();

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Discard cached field values");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(
        `path:/api/field/${field.id}/discard_values`,
        {
          method: "POST",
        },
      ),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Discard triggered!");
    });

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Discard triggered!");
    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(
        `path:/api/field/${field.id}/discard_values`,
        {
          method: "POST",
        },
      ),
    ).toHaveLength(2);

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Discard triggered!");

    await act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(button).toHaveTextContent("Discard cached field values");
  });

  it("should show error message toast", async () => {
    const { field } = setup();

    fetchMock.modifyRoute(`field-${field.id}-discard-values`, {
      response: { status: 500 },
    });

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Discard cached field values");

    await userEvent.click(button);
    expect(
      fetchMock.callHistory.calls(
        `path:/api/field/${field.id}/discard_values`,
        {
          method: "POST",
        },
      ),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(button).toHaveTextContent("Discard cached field values");
    });

    await waitFor(() => {
      const undo = screen.getByTestId("undo-list");
      expect(
        within(undo).getByText("Failed to discard values"),
      ).toBeInTheDocument();
    });
  });
});
