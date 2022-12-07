import { createContext, useContext } from "react";
import _ from "underscore";

export type DataAppContextType = {
  bulkActions: {
    cardId: number | null;
    selectedRowIndexes: number[];
    addRow: (cardId: number, index: number) => void;
    removeRow: (index: number) => void;
    clearSelection: () => void;
  };
};

export const DataAppContext = createContext<DataAppContextType>({
  bulkActions: {
    cardId: null,
    selectedRowIndexes: [],
    addRow: _.noop,
    removeRow: _.noop,
    clearSelection: _.noop,
  },
});

export function useDataAppContext() {
  return useContext(DataAppContext);
}
