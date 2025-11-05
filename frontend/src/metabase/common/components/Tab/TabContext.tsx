import { createContext } from "react";

export interface TabContextType {
  value: unknown;
  idPrefix: string;
  isDefault: boolean;
  onChange?: (value: unknown) => void;
}

export const TabContext = createContext<TabContextType>({
  value: null,
  idPrefix: "",
  isDefault: true,
});
