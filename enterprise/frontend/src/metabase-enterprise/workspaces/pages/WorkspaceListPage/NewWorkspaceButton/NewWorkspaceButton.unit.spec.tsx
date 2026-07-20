import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { NewWorkspaceButton } from "./NewWorkspaceButton";

const ELIGIBLE_DATABASE = createMockDatabase({
  features: ["workspace"],
  settings: { "database-enable-workspaces": true },
});

type SetupOpts = {
  databases?: Database[];
  isRemoteSyncEnabled?: boolean;
};

function setup({ databases = [], isRemoteSyncEnabled = true }: SetupOpts = {}) {
  renderWithProviders(<NewWorkspaceButton databases={databases} />, {
    storeInitialState: {
      settings: createMockSettingsState({
        "remote-sync-enabled": isRemoteSyncEnabled,
      }),
    },
  });
}

describe("NewWorkspaceButton", () => {
  it("opens the New workspace modal when clicked", async () => {
    setup({ databases: [ELIGIBLE_DATABASE] });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      await screen.findByRole("heading", { name: "Create a workspace" }),
    ).toBeInTheDocument();
  });

  it("is disabled when no database has workspaces enabled", () => {
    setup({ databases: [createMockDatabase({ features: ["workspace"] })] });

    expect(screen.getByRole("button", { name: /New/ })).toBeDisabled();
  });

  it("is disabled when remote sync is not set up", () => {
    setup({ databases: [ELIGIBLE_DATABASE], isRemoteSyncEnabled: false });

    expect(screen.getByRole("button", { name: /New/ })).toBeDisabled();
  });
});
