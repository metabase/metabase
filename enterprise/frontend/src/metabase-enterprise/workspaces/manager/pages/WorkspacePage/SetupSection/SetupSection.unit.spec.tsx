import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { SetupSection } from "./SetupSection";

describe("SetupSection", () => {
  it("should enable the download button and link to the config endpoint when databases are configured", () => {
    const workspace = createMockWorkspace({
      id: 7,
      databases: [createMockWorkspaceDatabase({ database_id: 1 })],
    });

    renderWithProviders(<SetupSection workspace={workspace} />);

    const downloadLink = screen.getByRole("link", {
      name: /Download config file/i,
    });
    expect(downloadLink).toHaveAttribute(
      "href",
      `/api/ee/workspace-manager/${workspace.id}/config/yaml`,
    );
    expect(downloadLink).toHaveAttribute("download", "config.yml");
  });

  it("should disable the download button and explain why when no databases are configured", async () => {
    const workspace = createMockWorkspace({ id: 7, databases: [] });

    renderWithProviders(<SetupSection workspace={workspace} />);

    expect(
      screen.queryByRole("link", { name: /Download config file/i }),
    ).not.toBeInTheDocument();
    const button = screen.getByRole("button", {
      name: /Download config file/i,
    });
    expect(button).toBeDisabled();

    await userEvent.hover(button);
    expect(
      await screen.findByText("No databases configured yet."),
    ).toBeInTheDocument();
  });
});
