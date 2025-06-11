import React, { useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import { setupEmbeddingSettings } from "metabase/setup/actions";
import { Box } from "metabase/ui";
import type { DatabaseData, Table } from "metabase-types/api";

type EmbeddingSetupProps = {
  children: React.ReactNode;
};

export const EmbeddingSetup = ({ children }: EmbeddingSetupProps) => {
  const [database, setDatabase] = useState<DatabaseData | null>(null);
  const [processingStatus, setProcessingStatus] = useState("");
  const [sandboxingColumn, setSandboxingColumn] = useState<Table | null>(null);
  const [error, setError] = useState("");
  const [selectedTables, setSelectedTables] = useState<Table[]>([]);

  const dispatch = useDispatch();

  const handleDatabaseSubmit = async (databaseData: DatabaseData) => {
    setProcessingStatus("Connecting to database...");
    setError("");

    // Actually create the database
    let createdDatabase = null;
    try {
      const response = await fetch("/api/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(databaseData),
      });
      if (!response.ok) {
        throw new Error("Failed to create database");
      }
      createdDatabase = await response.json();
      setDatabase(createdDatabase);
    } catch (err) {
      setError(
        "Failed to connect to the database. Please check your settings and try again.",
      );
      return;
    }

    setProcessingStatus("Creating models...");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setProcessingStatus("Generating X-rays...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check for potential sandboxing columns
    const potentialColumns = createdDatabase.tables?.filter((table: Table) =>
      table.fields?.some(
        (col) =>
          col.name.toLowerCase().includes("user") ||
          col.name.toLowerCase().includes("tenant") ||
          col.name.toLowerCase().includes("organization"),
      ),
    );

    if (potentialColumns && potentialColumns.length > 0) {
      setSandboxingColumn(potentialColumns[0]);
    }

    setProcessingStatus("Setting up embedding...");
    await dispatch(
      setupEmbeddingSettings({
        // TODO: check which settings we actually need for this iteration
        "embedding-homepage": "visible",
        "enable-embedding": true,
        "setup-license-active-at-setup": false, // is this new setup only available on enterprise?
        "setup-embedding-autoenabled": true,
        "jwt-enabled": true,
        "jwt-group-sync": true,
        "jwt-user-provisioning-enabled?": true,
        "jwt-shared-secret":
          "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        "jwt-identity-provider-uri": window.location.origin,
      }),
    );
  };

  const handleTableSelection = (tables: Table[]) => {
    setSelectedTables(tables);
    setProcessingStatus("Creating models and dashboards...");
  };

  const sharedProps = {
    database,
    processingStatus,
    sandboxingColumn,
    error,
    onSubmit: handleDatabaseSubmit,
  };

  return (
    <Box p="xl" maw={800} mx="auto">
      {children &&
        React.cloneElement(children as React.ReactElement, {
          ...sharedProps,
          selectedTables,
          onTableSelection: handleTableSelection,
        })}
    </Box>
  );
};
