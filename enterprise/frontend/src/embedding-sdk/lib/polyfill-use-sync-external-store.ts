import React from "react";
import { useSyncExternalStore } from "use-sync-external-store";

// Patches useSyncExternalStore if we are in React 17.
if (!("useSyncExternalStore" in React)) {
  // @ts-expect-error - we're patching for React 17, which doesn't have this method.
  React.useSyncExternalStore = useSyncExternalStore;
}
