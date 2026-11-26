import { mockSettings } from "__support__/settings";
import { PLUGIN_WORKSPACES, reinitialize } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { WorkspaceDatabaseSection } from "./components/WorkspaceDatabaseSection";

import { initializePlugin } from "./index";

const setup = ({ hasWorkspacesFeature }: { hasWorkspacesFeature: boolean }) => {
  mockSettings({
    "token-features": createMockTokenFeatures({
      workspaces: hasWorkspacesFeature,
    }),
  });
  initializePlugin();
};

describe("workspaces plugin", () => {
  afterEach(() => {
    reinitialize();
  });

  it("fills the slot with the workspaces feature", () => {
    setup({ hasWorkspacesFeature: true });

    expect(PLUGIN_WORKSPACES.WorkspaceDatabaseSection).toBe(
      WorkspaceDatabaseSection,
    );
  });

  it("leaves the slot empty without the workspaces feature", () => {
    setup({ hasWorkspacesFeature: false });

    expect(PLUGIN_WORKSPACES.WorkspaceDatabaseSection).not.toBe(
      WorkspaceDatabaseSection,
    );
  });
});
