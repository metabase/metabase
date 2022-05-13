import { createContext } from "react";

export interface TabContextType {
  value?: unknown;
  onChange?: (value: unknown) => void;
}

const TabContext = createContext<TabContextType>({
  value: {},
});

export default TabContext;
