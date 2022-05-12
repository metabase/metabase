import { createContext } from "react";

export interface TabGroupContextType {
  value?: unknown;
  onChange?: (value: unknown) => void;
}

const TabGroupContext = createContext<TabGroupContextType>({
  value: {},
});

export default TabGroupContext;
