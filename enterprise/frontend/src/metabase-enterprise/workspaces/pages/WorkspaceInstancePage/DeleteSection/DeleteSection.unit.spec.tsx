import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupDeleteWorkspaceInstanceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";

import { DeleteSection } from "./DeleteSection";

function setup() {
  setupDeleteWorkspaceInstanceEndpoint();

  renderWithProviders(<Route path="*" component={DeleteSection} />, {
    withRouter: true,
  });
}

describe("DeleteSection", () => {
  it("calls DELETE /api/ee/workspace-instance/current after confirming", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Exit workspace mode" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Exit workspace mode" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/workspace-instance/current",
          { method: "DELETE" },
        ),
      ).toBe(true);
    });
  });
});
