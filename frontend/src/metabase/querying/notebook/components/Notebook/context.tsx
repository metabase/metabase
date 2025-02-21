import { type PropsWithChildren, createContext, useContext } from "react";

import type { DataPickerValue } from "metabase/common/components/DataPicker";

export type NotebookContextType = {
  modelsFilterList: DataPickerValue["model"][];
};

export const NotebookContext = createContext<NotebookContextType | undefined>(
  undefined,
);

export const NotebookProvider = ({
  modelsFilterList = ["table", "card", "dataset", "metric"],
  children,
}: PropsWithChildren<Partial<NotebookContextType>>) => {
  return (
    <NotebookContext.Provider value={{ modelsFilterList }}>
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
