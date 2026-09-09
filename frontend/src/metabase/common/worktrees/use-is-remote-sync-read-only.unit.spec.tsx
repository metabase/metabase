import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { WorktreeProvider } from "./WorktreeContext";
import { useIsRemoteSyncReadOnly } from "./use-is-remote-sync-read-only";

function Probe() {
  const isReadOnly = useIsRemoteSyncReadOnly();
  return <div data-testid="probe">{String(isReadOnly)}</div>;
}

const setup = ({
  syncType = "read-only",
  worktreeId,
}: {
  syncType?: "read-only" | "read-write";
  worktreeId?: number;
} = {}) => {
  const settings = createMockSettings({
    "remote-sync-enabled": true,
    "remote-sync-type": syncType,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);

  const storeInitialState = createMockState({
    settings: mockSettings({
      "remote-sync-enabled": true,
      "remote-sync-type": syncType,
      "token-features": createMockTokenFeatures({ remote_sync: true }),
    }),
  });

  // hasPremiumFeature reads the MetabaseSettings singleton synchronously, so it must be seeded
  // (mockSettings, above) before the EE plugins register their selectors.
  setupEnterprisePlugins();

  const ui =
    worktreeId != null ? (
      <WorktreeProvider worktreeId={worktreeId}>
        <Probe />
      </WorktreeProvider>
    ) : (
      <Probe />
    );

  return renderWithProviders(ui, { storeInitialState });
};

describe("useIsRemoteSyncReadOnly", () => {
  it("returns true when read-only outside a worktree", () => {
    setup({ syncType: "read-only" });

    expect(screen.getByTestId("probe")).toHaveTextContent("true");
  });

  it("returns false when read-only inside a worktree", () => {
    setup({ syncType: "read-only", worktreeId: 1 });

    expect(screen.getByTestId("probe")).toHaveTextContent("false");
  });

  it("returns false when not read-only outside a worktree", () => {
    setup({ syncType: "read-write" });

    expect(screen.getByTestId("probe")).toHaveTextContent("false");
  });

  it("returns false when not read-only inside a worktree", () => {
    setup({ syncType: "read-write", worktreeId: 1 });

    expect(screen.getByTestId("probe")).toHaveTextContent("false");
  });
});
