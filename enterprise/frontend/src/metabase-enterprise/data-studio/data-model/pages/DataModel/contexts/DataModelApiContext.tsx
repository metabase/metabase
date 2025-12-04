import { type ReactNode, createContext, useContext, useRef } from "react";

type Actions = "refetchSelectedTables" | "refetchFilteredTables";

type DataModelApiContextValue = {
  registerAction: (key: Actions, callback: () => void) => void;
  invokeAction: (key: Actions) => void;
  unregisterAction: (key: Actions) => void;
};

const DataModelApiContext = createContext<DataModelApiContextValue | null>(
  null,
);

export const DataModelApiProvider = ({ children }: { children: ReactNode }) => {
  const actionsList = useRef(new Map());

  const registerAction = (key: Actions, callback: () => void) => {
    actionsList.current.set(key, callback);
  };

  const invokeAction = (key: Actions) => {
    actionsList.current.get(key)?.();
  };

  const unregisterAction = (key: Actions) => {
    actionsList.current.delete(key);
  };

  return (
    <DataModelApiContext.Provider
      value={{
        registerAction,
        invokeAction,
        unregisterAction,
      }}
    >
      {children}
    </DataModelApiContext.Provider>
  );
};

export const useDataModelApi = () => {
  const context = useContext(DataModelApiContext);
  if (!context) {
    throw new Error(
      "useDataModelApi must be used within a DataModelApiProvider",
    );
  }
  return context;
};
