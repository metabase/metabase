import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { WorkspaceInstanceEmptyState } from "./WorkspaceInstanceEmptyState";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

function setup({ isDevelopmentMode = true } = {}) {
  renderWithProviders(<WorkspaceInstanceEmptyState />, {
    storeInitialState: {
      settings: createMockSettingsState(
        createMockSettings({
          "token-features": createMockTokenFeatures({
            development_mode: isDevelopmentMode,
          }),
        }),
      ),
    },
  });
}

describe("WorkspaceInstanceEmptyState", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("shows the set up button in development mode", () => {
    setup({ isDevelopmentMode: true });

    expect(
      screen.getByRole("button", { name: "Set up a workspace" }),
    ).toBeInTheDocument();
  });

  it("hides the set up button outside of development mode", () => {
    setup({ isDevelopmentMode: false });

    expect(
      screen.queryByRole("button", { name: "Set up a workspace" }),
    ).not.toBeInTheDocument();
  });

  it("tracks an analytics event when the set up button is clicked", async () => {
    setup({ isDevelopmentMode: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Set up a workspace" }),
    );

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "workspaces_setup_button_clicked",
    });
  });
});
