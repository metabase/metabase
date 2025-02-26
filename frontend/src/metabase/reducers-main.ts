// Reducers needed for main application

import { combineReducers } from "@reduxjs/toolkit";

import admin from "metabase/admin/admin";
import * as pulse from "metabase/notifications/pulse/reducers";
import { PLUGIN_REDUCERS } from "metabase/plugins";
import * as qb from "metabase/queryhttps://github.com/metabase/metabase/pull/52436/conflict?name=frontend%252Fsrc%252Fmetabase%252Freducers-main.ts&ancestor_oid=83b9d8c0bd495d0485b1a4fbc1c92af89b69cc08&base_oid=683681d4e5ce0ef9c600da36477d347b164a4abd&head_oid=37cabaa95921e7e7750e3502323ceacd922b5f39_builder/reducers";
import revisions from "metabase/redux/revisions";
import reference from "metabase/reference/reference";
import { reducer as setup } from "metabase/setup/reducers";

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
    qb: combineReducers(qb),
    reference,
    revisions,
    setup,
    admin,
    plugins: combineReducers(PLUGIN_REDUCERS),
  };
}

export const mainReducers = makeMainReducers();