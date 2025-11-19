import React from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

// Monkey-patches useSyncExternalStore if we are in React 17,
// where useSyncExternalStore is not available.
// This is used in react-redux v8, until they've dropped the shim in v9.
const shouldShimExternalStore = () => !("useSyncExternalStore" in React);

if (shouldShimExternalStore()) {
  React.useSyncExternalStore = useSyncExternalStore;
}
