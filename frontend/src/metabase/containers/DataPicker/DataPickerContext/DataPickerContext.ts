import { createContext, useContext } from "react";
import _ from "underscore";

export interface IDataPickerContext {
  search: {
    query: string;
    setQuery: (query: string) => void;
  };
}

export const DataPickerContext = createContext<IDataPickerContext>({
  search: {
    query: "",
    setQuery: _.noop,
  },
});

export function useDataPicker() {
  return useContext(DataPickerContext);
}
