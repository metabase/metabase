import { createContext } from "react";

type DataStudioContextType = {
  isSidebarOpened: boolean;
  isSidebarAvailable: boolean;
  setIsSidebarOpened: (isOpened: boolean) => void;
  setIsSidebarAvailable: (isAvailable: boolean) => void;
};

export const DataStudioContext = createContext<DataStudioContextType>({
  isSidebarOpened: false,
  isSidebarAvailable: false,
  setIsSidebarOpened: () => undefined,
  setIsSidebarAvailable: () => undefined,
});
