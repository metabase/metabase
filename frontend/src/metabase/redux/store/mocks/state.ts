import type { SdkSharedStoreState } from "metabase/embedding-sdk/types/store";
import type { SettingsState, State } from "metabase/redux/store";
import { createMockUser } from "metabase-types/api/mocks";

import { createMockAdminState } from "./admin";
import { createMockApiState } from "./api";
import { createMockAppState } from "./app";
import { createMockAuthState } from "./auth";
import { createMockDashboardState } from "./dashboard";
import { createMockEmbedState } from "./embed";
import { createMockEmbeddingDataPickerState } from "./embedding-data-picker";
import { createMockNormalizedEntitiesState } from "./entities";
import { createMockModalState } from "./modal";
import { createMockParametersState } from "./parameters";
import { createMockQueryBuilderState } from "./qb";
import { createMockRoutingState } from "./routing";
import { createMockSettingsState } from "./settings";
import { createMockSetupState } from "./setup";
import { createMockUploadState } from "./upload";
import { createMockVisualizerState } from "./visualizer";

/**
 * The shape accepted (and returned) by mock-state builders and test render
 * harnesses: `State` plus seed-only fields with no reducer behind them.
 * `settings` is mirrored into `window.MetabaseBootstrap` below; the render
 * harnesses strip it before it reaches `preloadedState`.
 */
export type StoreSeedState = State & {
  settings: SettingsState;
};

export function createMockState<S extends Pick<SdkSharedStoreState, "sdk">>(
  opts: Partial<StoreSeedState> & S,
): StoreSeedState & S;
export function createMockState(opts?: Partial<StoreSeedState>): StoreSeedState;
export function createMockState(opts: any) {
  const state = {
    admin: createMockAdminState(),
    app: createMockAppState(),
    auth: createMockAuthState(),
    currentUser: createMockUser(),
    dashboard: createMockDashboardState(),
    embed: createMockEmbedState(),
    embeddingDataPicker: createMockEmbeddingDataPickerState(),
    entities: createMockNormalizedEntitiesState(),
    "metabase-api": createMockApiState(),
    parameters: createMockParametersState(),
    qb: createMockQueryBuilderState(),
    routing: createMockRoutingState(),
    settings: createMockSettingsState(),
    setup: createMockSetupState(),
    upload: createMockUploadState(),
    visualizer: {
      past: [],
      present: createMockVisualizerState(),
      future: [],
    },
    modal: createMockModalState(),
    ...opts,
  };

  // Settings resolve from the `getSessionProperties` cache, falling back to
  // `window.MetabaseBootstrap`. Mirror the mock settings into the bootstrap so
  // store-less/selector tests can read them. Jest-only (the global would leak
  // across Storybook stories); only fills an empty bootstrap so an explicit
  // seed isn't clobbered.
  const hasExplicitSettings = opts?.settings != null;
  if (
    process.env.NODE_ENV === "test" &&
    typeof window !== "undefined" &&
    state.settings?.values &&
    (hasExplicitSettings || window.MetabaseBootstrap === undefined)
  ) {
    window.MetabaseBootstrap = state.settings.values;
  }

  return state;
}
