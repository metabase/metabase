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
  isLoaded: boolean;
  format: (text: string) => string;
};

export const DataAppContext = createContext<DataAppContextType>({
  data: {},
  isLoaded: true,
  format: (text: string) => text,
});

export function useDataAppContext() {
  return useContext(DataAppContext);
}
