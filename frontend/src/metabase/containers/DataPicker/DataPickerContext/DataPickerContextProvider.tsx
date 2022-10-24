import React, { useMemo, useState } from "react";
import { DataPickerContext, IDataPickerContext } from "./DataPickerContext";

function DataPickerContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const value: IDataPickerContext = useMemo(
    () => ({
      search: {
        query: searchQuery,
        setQuery: setSearchQuery,
      },
    }),
    [searchQuery],
  );

  return (
    <DataPickerContext.Provider value={value}>
      {children}
    </DataPickerContext.Provider>
  );
}

export default DataPickerContextProvider;
