import React from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

import { isReact17OrEarlier } from "metabase/lib/react-compat";

// Monkey-patches useSyncExternalStore if we are in React 17,
// where useSyncExternalStore is not available.
// This is used in react-redux v8, until they've dropped the shim in v9.
if (isReact17OrEarlier()) {
  React.useSyncExternalStore = useSyncExternalStore;
}
