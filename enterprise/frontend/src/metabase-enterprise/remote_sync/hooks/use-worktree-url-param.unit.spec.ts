import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderHookWithProviders } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { getWorktreeId } from "../selectors";

import { useWorktreeUrlParam } from "./use-worktree-url-param";

function setup(initialRoute: string) {
  // The plugin registers its reducer only once the premium gate passes, so the settings come first.
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });
  setupEnterprisePlugins();

  const { store } = renderHookWithProviders(() => useWorktreeUrlParam(), {
    withRouter: true,
    initialRoute,
    storeInitialState: createMockState({ settings }),
  });

  return { getCurrentWorktreeId: () => getWorktreeId(store.getState()) };
}

describe("useWorktreeUrlParam", () => {
  it("enters the worktree the url names", () => {
    const { getCurrentWorktreeId } = setup("/collection/root?worktree=7");

    expect(getCurrentWorktreeId()).toBe(7);
  });

  it("stays in the main app without the param", () => {
    const { getCurrentWorktreeId } = setup("/collection/root");

    expect(getCurrentWorktreeId()).toBeNull();
  });

  it("ignores a worktree that is not an id", () => {
    const { getCurrentWorktreeId } = setup("/collection/root?worktree=main");

    expect(getCurrentWorktreeId()).toBeNull();
  });
});
