import { createContext, useContext } from "react";
import _ from "lodash";

import { Column } from "metabase-types/types/Dataset";

type FieldName = string;
type CardName = string;

type ObjectDetailField = {
  column: Column;
  value: unknown;
};

export type FormattedObjectDetail = Record<FieldName, ObjectDetailField>;

export type DataContextType = Record<CardName, FormattedObjectDetail>;

export type DataAppContextType = {
  data: DataContextType;
  bulkActions: {
    cardId: number | null;
    selectedRowIndexes: number[];
    addRow: (cardId: number, index: number) => void;
    removeRow: (index: number) => void;
    clearSelection: () => void;
  };
  isLoaded: boolean;
  format: (text: string) => string;
};

export const DataAppContext = createContext<DataAppContextType>({
  data: {},
  bulkActions: {
    cardId: null,
    selectedRowIndexes: [],
    addRow: _.noop,
    removeRow: _.noop,
    clearSelection: _.noop,
  },
  isLoaded: true,
  format: (text: string) => text,
});

export function useDataAppContext() {
  return useContext(DataAppContext);
}
