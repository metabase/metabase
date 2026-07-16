import { type ReactNode, createContext, useState } from "react";

import {
  type OverlayStackContextStore,
  createOverlayStackStore,
} from "./store";

type OverlayStackContextType = OverlayStackContextStore;

export const OverlayStackContext =
  createContext<OverlayStackContextType | null>(null);

export const OverlayStackProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState(createOverlayStackStore);

  return (
    <OverlayStackContext.Provider value={store}>
      {children}
    </OverlayStackContext.Provider>
  );
};
