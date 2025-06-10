import { createContext, useContext, useState } from "react";

import type { DatabaseData, Table } from "metabase-types/api";
import { getLocale } from "metabase/setup/selectors";
import { useSelector } from "metabase/lib/redux";

type EmbeddingSetupContextType = {
  database: DatabaseData | null;
  setDatabase: (database: DatabaseData | null) => void;
  processingStatus: string;
  setProcessingStatus: (status: string) => void;
  error: string;
  setError: (error: string) => void;
  selectedTables: Table[];
  setSelectedTables: (tables: Table[]) => void;
  sandboxingColumn: Table | null;
  setSandboxingColumn: (table: Table | null) => void;
  createdDashboardIds: number[];
  setCreatedDashboardIds: (ids: number[]) => void;
};

const EmbeddingSetupContext = createContext<EmbeddingSetupContextType | null>(
  null,
);

export const useEmbeddingSetup = () => {
  const context = useContext(EmbeddingSetupContext);
  // console.log("useEmbeddingSetup", context?.locale?.code);
  if (!context) {
    throw new Error(
      "useEmbeddingSetup must be used within EmbeddingSetupProvider",
    );
  }
  return context;
};

export const EmbeddingSetupProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const locale = useSelector(getLocale);
  const [database, setDatabase] = useState<DatabaseData | null>(null);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState("");
  const [selectedTables, setSelectedTables] = useState<Table[]>([]);
  const [sandboxingColumn, setSandboxingColumn] = useState<Table | null>(null);
  const [createdDashboardIds, setCreatedDashboardIds] = useState<number[]>([]);

  return (
    <EmbeddingSetupContext.Provider
      value={{
        locale,
        database,
        setDatabase,
        processingStatus,
        setProcessingStatus,
        error,
        setError,
        selectedTables,
        setSelectedTables,
        sandboxingColumn,
        setSandboxingColumn,
        createdDashboardIds,
        setCreatedDashboardIds,
      }}
    >
      {children}
    </EmbeddingSetupContext.Provider>
  );
};
