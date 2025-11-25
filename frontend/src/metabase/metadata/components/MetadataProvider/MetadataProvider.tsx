import { type PropsWithChildren, createContext, useContext } from "react";

import type { MetadataEventSource } from "metabase/metadata/pages/DataModelV1/types";

interface DataModelContextValue {
  eventSource: MetadataEventSource;
}

const DataModelContext = createContext<DataModelContextValue>({
  eventSource: "admin",
});

export const useDataModelContext = () => useContext(DataModelContext);

export const DataModelProvider = ({
  children,
  ...value
}: PropsWithChildren<DataModelContextValue>) => (
  <DataModelContext.Provider value={value}>
    {children}
  </DataModelContext.Provider>
);
