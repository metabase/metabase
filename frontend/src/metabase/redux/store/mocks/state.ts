import type { SdkSharedStoreState } from "metabase/embedding-sdk/types/store";
import type { SettingsState, State } from "metabase/redux/store";
import type { User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { createMockAdminState } from "./admin";
import { createMockApiState, seedCurrentUserApiState } from "./api";
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
 * `settings` is mirrored into `window.MetabaseBootstrap` and `currentUser`
 * into the `getCurrentUser` RTK Query cache entry below; the render harnesses
 * strip both before they reach `preloadedState`.
 */
export type StoreSeedState = State & {
  settings: SettingsState;
  currentUser: User | null;
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
  // seed isn't clobbered. Merge rather than replace, so the non-settings
  // metadata that `metabase-bootstrap.js` puts in the bootstrap (semantic type
  // hierarchy, timezones) survives the mirror.
  const hasExplicitSettings = opts?.settings != null;
  if (
    process.env.NODE_ENV === "test" &&
    typeof window !== "undefined" &&
    state.settings?.values &&
    (hasExplicitSettings || window.MetabaseBootstrap === undefined)
  ) {
    window.MetabaseBootstrap = {
      ...window.MetabaseBootstrap,
      ...state.settings.values,
    };
  }

  // There's no `currentUser` reducer either — the current user is read from
  // the `getCurrentUser` RTK Query cache — so mirror the field into the cache
  // entry for selectors like `getUser` to find.
  if (state.currentUser) {
    state["metabase-api"] = seedCurrentUserApiState(
      state["metabase-api"],
      state.currentUser,
    );
  }

  return state;
}
