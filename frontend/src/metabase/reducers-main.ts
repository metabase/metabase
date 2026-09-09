// Reducers needed for main application

import {
  type StateFromReducersMapObject,
  combineReducers,
} from "@reduxjs/toolkit";

import { admin } from "metabase/admin/admin";
import * as pulse from "metabase/notifications/pulse/reducers";
import { PLUGIN_REDUCERS } from "metabase/plugins";
import { queryBuilderReducer } from "metabase/query_builder";
import revisions from "metabase/redux/revisions";
import type { State } from "metabase/redux/store";
import reference from "metabase/reference/reference";
import { reducer as setup } from "metabase/setup/reducers";
import { reducer as visualizer } from "metabase/visualizer/visualizer.slice";

import { commonReducers } from "./reducers-common";

/*
Create a main reducers factory
This solves a race condition in tests, where tests were referencing
the mainReducers const before the EE plugins were required. This way
tests can get a fresh reducers object _after_ the EE plugins are required
while the default behavior is preserved.
*/
export function makeMainReducers() {
  return {
    ...commonReducers,
    // main app reducers
    pulse: combineReducers(pulse),
    qb: queryBuilderReducer,
    reference,
    revisions,
    setup,
    admin,
    plugins: combineReducers(PLUGIN_REDUCERS),
    visualizer,
  };
}

export const mainReducers = makeMainReducers();

/**
 * The main app's state, derived from the slices this root composes.
 *
 * Registering a slice here is the only way to add a key. Nothing declares the
 * shape by hand, so a root and its state type cannot drift apart.
 */
export type MainState = StateFromReducersMapObject<
  ReturnType<typeof makeMainReducers>
>;

/**
 * `State` is still written by hand in `metabase/redux/store`, and modules type
 * their selectors against it. These checks fail the build when it stops
 * describing what this root composes. Remove them with `State` itself.
 */
type Assert<T extends true> = T;

/**
 * Every key `State` declares is a slice this root really registers. A key left
 * behind after its slice moves out fails here.
 */
export type _EveryStateKeyIsRegistered = Assert<
  keyof State extends keyof MainState ? true : false
>;

/**
 * The reverse does not hold. This root registers three slices that `State`
 * never declared, so code reading them types them itself.
 *
 * Declaring them would mean importing their types into `metabase/redux/store`,
 * which sits far below this root and may not reach up to it. They resolve when
 * `State` moves out of the shared tier, not before. Pinned here so the gap
 * cannot grow.
 */
export type _UndeclaredKeysAreOnlyTheKnownThree = Assert<
  Exclude<keyof MainState, keyof State> extends
    | "reference"
    | "revisions"
    | "plugins"
    ? true
    : false
>;
