import { createContext } from "react";

export interface TabContextType {
  value?: unknown;
  isDefault?: boolean;
  onChange?: (value: unknown) => void;
}

const TabContext = createContext<TabContextType>({ isDefault: true });

export default TabContext;
