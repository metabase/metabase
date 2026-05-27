import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { SetupSection } from "./SetupSection";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

function setup({ workspace = createMockWorkspace() } = {}) {
  renderWithProviders(<SetupSection workspace={workspace} />);
}

describe("SetupSection", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("renders an enabled download link when the workspace has databases", () => {
    const workspace = createMockWorkspace({
      databases: [createMockWorkspaceDatabase()],
    });
    setup({ workspace });

    const button = screen.getByRole("link", { name: /Download config\.yml/ });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute(
      "href",
      `/api/ee/workspace-manager/${workspace.id}/config`,
    );
  });

  it("tracks an analytics event when the config is downloaded", async () => {
    const workspace = createMockWorkspace({
      databases: [createMockWorkspaceDatabase()],
    });
    setup({ workspace });

    await userEvent.click(
      screen.getByRole("link", { name: /Download config\.yml/ }),
    );

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "workspaces_config_downloaded",
      target_id: workspace.id,
    });
  });

  it("disables the download button and shows a tooltip when the workspace has no databases", async () => {
    setup({ workspace: createMockWorkspace({ databases: [] }) });

    const button = screen.getByRole("button", { name: /Download config\.yml/ });
    expect(button).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: /Download config\.yml/ }),
    ).not.toBeInTheDocument();

    await userEvent.hover(button);
    expect(
      await screen.findByText("You need to add at least one database."),
    ).toBeInTheDocument();
  });
});
