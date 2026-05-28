import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { WorkspaceInstanceEmptyState } from "./WorkspaceInstanceEmptyState";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

function setup() {
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);

  renderWithProviders(<WorkspaceInstanceEmptyState />);
}

describe("WorkspaceInstanceEmptyState", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("shows the set up button", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Set up a workspace" }),
    ).toBeInTheDocument();
  });

  it("tracks an analytics event when the set up button is clicked", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Set up a workspace" }),
    );

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "workspaces_setup_button_clicked",
    });
  });
});
