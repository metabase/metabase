import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockWorkspace } from "metabase-types/api/mocks";

import type { WorkspaceInfo } from "../../../types";

import { WorkspaceHeader } from "./WorkspaceHeader";

type SetupOpts = {
  workspace: WorkspaceInfo;
};

function setup({ workspace }: SetupOpts) {
  const onNameChange = jest.fn<void, [string]>();
  renderWithProviders(
    <WorkspaceHeader workspace={workspace} onNameChange={onNameChange} />,
    { withRouter: true },
  );
  return { onNameChange };
}

describe("WorkspaceHeader", () => {
  it("should rename an existing workspace", async () => {
    const { onNameChange } = setup({
      workspace: createMockWorkspace({ name: "Analytics" }),
    });

    const input = screen.getByDisplayValue("Analytics");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    await userEvent.tab();

    expect(onNameChange).toHaveBeenCalledWith("Renamed");
  });
});
