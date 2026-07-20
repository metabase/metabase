import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { NewWorkspaceButton } from "./NewWorkspaceButton";

type SetupOpts = {
  databases?: Database[];
};

function setup({ databases = [] }: SetupOpts = {}) {
  renderWithProviders(<NewWorkspaceButton databases={databases} />);
}

describe("NewWorkspaceButton", () => {
  it("opens the New workspace modal when clicked", async () => {
    setup({
      databases: [
        createMockDatabase({
          features: ["workspace"],
          settings: { "database-enable-workspaces": true },
        }),
      ],
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      await screen.findByRole("heading", { name: "Create a workspace" }),
    ).toBeInTheDocument();
  });

  it("is disabled when no database has workspaces enabled", () => {
    setup({ databases: [createMockDatabase({ features: ["workspace"] })] });

    expect(screen.getByRole("button", { name: /New/ })).toBeDisabled();
  });
});
