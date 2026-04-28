import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import type { WorkspaceInfo } from "../../../types";

import { SetupSection } from "./SetupSection";

type SetupOpts = {
  workspace: WorkspaceInfo;
};

function setup({ workspace }: SetupOpts) {
  renderWithProviders(<SetupSection workspace={workspace} />);
}

describe("SetupSection", () => {
  it("should expose a link to download the workspace config", () => {
    const workspace = createMockWorkspace({
      databases: [createMockWorkspaceDatabase({ status: "provisioned" })],
    });
    setup({ workspace });

    expect(
      screen.getByRole("link", { name: "Download config file" }),
    ).toHaveAttribute("href", `/api/ee/workspace/${workspace.id}/config/yaml`);
  });
});
