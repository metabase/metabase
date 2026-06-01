import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";

import { DatabaseListApp } from "./DatabaseListApp";

const setup = () => {
  renderWithProviders(<DatabaseListApp>{null}</DatabaseListApp>, {
    storeInitialState: createMockState({
      settings: mockSettings(),
    }),
  });
};

describe("DatabaseListApp", () => {
  describe("when the database list fetch fails (metabase#20471)", () => {
    const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

    beforeEach(() => {
      fetchMock.get("path:/api/database", {
        status: 500,
        body: { message: errorMessage },
      });
    });

    it("renders the generic error UI and toggles the error details", async () => {
      setup();

      expect(
        await screen.findByText("Something’s gone wrong"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "We’ve run into an error. You can try refreshing the page, or just go back.",
        ),
      ).toBeInTheDocument();

      expect(screen.getByText(errorMessage)).not.toBeVisible();

      await userEvent.click(screen.getByText("Show error details"));

      expect(screen.getByText(errorMessage)).toBeVisible();
    });
  });
});
