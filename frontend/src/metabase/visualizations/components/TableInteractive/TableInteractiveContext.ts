import { createContext, useContext } from "react";

interface TableInteractiveContextValue {
  infoPopoversDisabled: boolean;
}

const TableInteractiveContext = createContext<TableInteractiveContextValue>({
  infoPopoversDisabled: false,
});

export const TableInteractiveContextProvider = TableInteractiveContext.Provider;

export const useTableInteractiveContext = () =>
  useContext(TableInteractiveContext);
