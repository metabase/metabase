import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { DataComplexityHeader } from "./ConversationStatsPage";

describe("DataComplexityHeader", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.callHistory.clear();
  });

  it("refreshes data complexity scores when the refresh button is clicked", async () => {
    const user = userEvent.setup();

    fetchMock.post("path:/api/ee/data-complexity-score/complexity/refresh", {});

    renderWithProviders(<DataComplexityHeader />);

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/data-complexity-score/complexity/refresh",
          { method: "POST" },
        ),
      ).toBe(true);
    });
  });
});
