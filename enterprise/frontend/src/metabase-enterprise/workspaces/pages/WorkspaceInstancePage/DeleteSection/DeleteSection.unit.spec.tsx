import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDeleteTableRemappingsEndpoint,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";

import { DeleteSection } from "./DeleteSection";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

function setup() {
  setupDeleteTableRemappingsEndpoint();
  setupUpdateSettingEndpoint();

  renderWithProviders(<Route path="*" component={DeleteSection} />, {
    withRouter: true,
  });
}

describe("DeleteSection", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("clears remappings and the instance-workspace setting after confirming", async () => {
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
          "path:/api/ee/workspace-instance/table-remappings",
          { method: "DELETE" },
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/setting/instance-workspace", {
          method: "PUT",
        }),
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
        event: "workspaces_instance_teardown",
      }),
    );
  });
});
