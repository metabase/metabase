import { createContext } from "react";

export interface TabContextType {
  value?: unknown;
  isDefault?: boolean;
  onChange?: (value: unknown) => void;
}

export const TabContext = createContext<TabContextType>({ isDefault: true });
