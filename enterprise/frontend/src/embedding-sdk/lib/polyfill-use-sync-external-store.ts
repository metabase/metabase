import React from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

import { getMajorReactVersion } from "metabase/lib/compat/check-version";

// Monkey-patches useSyncExternalStore if we are in React 17,
// where useSyncExternalStore is not available.
// This is used in react-redux v8, until they've dropped the shim in v9.
const reactVersion = getMajorReactVersion();

if (reactVersion <= 17) {
  React.useSyncExternalStore = useSyncExternalStore;
}
