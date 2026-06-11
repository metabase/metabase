import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupDeleteCurrentWorkspaceEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";

import { DeleteSection } from "./DeleteSection";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

function setup() {
  setupDeleteCurrentWorkspaceEndpoint();

  renderWithProviders(<Route path="*" component={DeleteSection} />, {
    withRouter: true,
  });
}

describe("DeleteSection", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("calls DELETE /api/ee/workspace-instance/current after confirming", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Leave workspace" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Leave workspace" }),
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

  it("tracks an analytics event when the instance is torn down", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Leave workspace" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Leave workspace" }),
    );

    await waitFor(() =>
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "workspaces_instance_leave",
      }),
    );
  });
});
