import { createContext } from "react";

type DataStudioContextType = {
  isSidebarOpened: boolean;
  setIsSidebarOpened: (isExpanded: boolean) => void;
};

export const DataStudioContext = createContext<DataStudioContextType>({
  isSidebarOpened: true,
  setIsSidebarOpened: () => undefined,
});
