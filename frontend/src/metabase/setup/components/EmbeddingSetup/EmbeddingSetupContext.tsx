import { createContext, useContext, useState } from "react";

import type { DatabaseData, Table } from "metabase-types/api";

import { useForceLocaleRefresh } from "./useForceLocaleRefresh";

type EmbeddingSetupContextType = {
  database: DatabaseData | null;
  setDatabase: (database: DatabaseData | null) => void;
  processingStatus: string;
  setProcessingStatus: (status: string) => void;
  error: string;
  setError: (error: string) => void;
  selectedTables: Table[];
  setSelectedTables: (tables: Table[]) => void;

  createdDashboardIds: number[];
  setCreatedDashboardIds: (ids: number[]) => void;
};

const EmbeddingSetupContext = createContext<EmbeddingSetupContextType | null>(
  null,
);

export const useEmbeddingSetup = () => {
  useForceLocaleRefresh();

  const context = useContext(EmbeddingSetupContext);

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
  const [database, setDatabase] = useState<DatabaseData | null>(null);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState("");
  const [selectedTables, setSelectedTables] = useState<Table[]>([]);
  const [createdDashboardIds, setCreatedDashboardIds] = useState<number[]>([]);

  return (
    <EmbeddingSetupContext.Provider
      value={{
        database,
        setDatabase,
        processingStatus,
        setProcessingStatus,
        error,
        setError,
        selectedTables,
        setSelectedTables,
        createdDashboardIds,
        setCreatedDashboardIds,
      }}
    >
      {children}
    </EmbeddingSetupContext.Provider>
  );
};
