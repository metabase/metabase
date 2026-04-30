import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";

import { DataComplexityHeader } from "./ConversationStatsPage";

describe("DataComplexityHeader", () => {
  it("recomputes data complexity scores when the recompute button is clicked", async () => {
    fetchMock.get("path:/api/ee/data-complexity-score/complexity", {});

    renderWithProviders(<DataComplexityHeader />);

    await userEvent.click(screen.getByRole("button", { name: "Recompute" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/data-complexity-score/complexity",
          {
            method: "GET",
            query: { "force-recalculation": "true" },
          },
        ),
      ).toBe(true);
    });
  });

  it("disables the recompute button while recomputation is running", async () => {
    let resolveRequest!: (value: unknown) => void;
    const pendingResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    fetchMock.get(
      "path:/api/ee/data-complexity-score/complexity",
      pendingResponse,
    );

    renderWithProviders(<DataComplexityHeader />);

    const button = screen.getByRole("button", { name: "Recompute" });
    await userEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    await act(async () => {
      resolveRequest({});
    });

    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  it("shows a toast when recomputation fails", async () => {
    fetchMock.get("path:/api/ee/data-complexity-score/complexity", 500);

    renderWithProviders(
      <>
        <DataComplexityHeader />
        <UndoListing />
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Recompute" }));

    await waitFor(() => {
      expect(
        screen.getByText("Could not recompute data complexity."),
      ).toBeInTheDocument();
    });
  });
});
