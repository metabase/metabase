import {
  type PropsWithChildren,
  createContext,
  useContext,
  useMemo,
} from "react";

import type { DataPickerValue } from "metabase/common/components/Pickers/DataPicker";

import type { NotebookDataPickerOptions } from "../../types";

export type NotebookContextType = {
  modelsFilterList: DataPickerValue["model"][];
  dataPickerOptions?: NotebookDataPickerOptions;
  allowTransformOnlyFunctions?: boolean;
};

export const NotebookContext = createContext<NotebookContextType | undefined>(
  undefined,
);

export const NotebookProvider = ({
  modelsFilterList = ["table", "card", "dataset", "metric"],
  dataPickerOptions,
  allowTransformOnlyFunctions,
  children,
}: PropsWithChildren<Partial<NotebookContextType>>) => {
  const value = useMemo(
    () => ({
      modelsFilterList,
      dataPickerOptions,
      allowTransformOnlyFunctions,
    }),
    [modelsFilterList, dataPickerOptions, allowTransformOnlyFunctions],
  );

  return (
    <NotebookContext.Provider value={value}>
      {children}
    </NotebookContext.Provider>
  );
};

export const useNotebookContext = () => {
  const context = useContext(NotebookContext);
  if (context === undefined) {
    throw new Error(
      "useNotebookContext must be used within a NotebookProvider",
    );
  }
  return context;
};
