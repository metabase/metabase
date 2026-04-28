import { renderWithProviders, screen } from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { WorkspaceList } from "./WorkspaceList";

type SetupOpts = {
  workspaces: Workspace[];
  filtered?: boolean;
};

function setup({ workspaces, filtered = false }: SetupOpts) {
  renderWithProviders(
    <WorkspaceList workspaces={workspaces} filtered={filtered} />,
  );
}

describe("WorkspaceList", () => {
  it("should display workspaces by name", () => {
    setup({ workspaces: [createMockWorkspace({ name: "Analytics" })] });

    expect(screen.getByText("Analytics")).toBeInTheDocument();
  });

  it("should show a different empty label when filtered to no results", () => {
    setup({ workspaces: [], filtered: true });

    expect(screen.getByText("No workspaces found")).toBeInTheDocument();
  });

  it("should show the default empty label when there are no workspaces", () => {
    setup({ workspaces: [] });

    expect(screen.getByText("No workspaces yet")).toBeInTheDocument();
  });
});
