import React from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

// Monkey-patches useSyncExternalStore if we are in React 17,
// where useSyncExternalStore is not available.
// This is used in react-redux v8, until they've dropped the shim in v9.
if (!("useSyncExternalStore" in React)) {
  // @ts-expect-error - we're patching for React 17, which doesn't have this method.
  React.useSyncExternalStore = useSyncExternalStore;
}
