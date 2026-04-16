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
};

export const NotebookContext = createContext<NotebookContextType | undefined>(
  undefined,
);

export const NotebookProvider = ({
  modelsFilterList = ["table", "card", "dataset", "metric"],
  dataPickerOptions,
  children,
}: PropsWithChildren<Partial<NotebookContextType>>) => {
  const value = useMemo(
    () => ({ modelsFilterList, dataPickerOptions }),
    [modelsFilterList, dataPickerOptions],
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
