import { type ReactNode, createContext, useContext, useState } from "react";

import { type OverlayStackStore, createOverlayStackStore } from "./store";

export const OverlayStackContext = createContext<OverlayStackStore | null>(
  null,
);

export const OverlayStackProvider = ({ children }: { children: ReactNode }) => {
  const parentStore = useContext(OverlayStackContext);
  const [store] = useState(createOverlayStackStore);

  // ThemeProvider (where this is mounted) renders many times and nests, but the
  // overlay stack must be a single shared store so Escape/click-outside gating
  // works across all overlays. Reusing any ancestor's store keeps the outermost
  // provider as the sole owner; nested ones pass through transparently.
  if (parentStore) {
    return <>{children}</>;
  }

  return (
    <OverlayStackContext.Provider value={store}>
      {children}
    </OverlayStackContext.Provider>
  );
};
