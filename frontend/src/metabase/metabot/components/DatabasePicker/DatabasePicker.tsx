import React from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { DatabaseId } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";

type DatabasePickerProps = {
  databases: Database[];
  selectedDatabaseId?: DatabaseId;
  variant?: "link" | "button";
  onChange: (databaseId: DatabaseId) => void;
};

const DatabasePicker = ({
  databases,
  variant,
  selectedDatabaseId,
  onChange,
}: DatabasePickerProps) => {
  const selectedDatabase = databases.find(d => d.id === selectedDatabaseId);
  const label = selectedDatabase ? selectedDatabase.name : t`Pick a database`;

  return (
    <DatabaseDataSelector
      triggerClasses={variant === "link" ? "inline" : ""}
      triggerElement={<Button onlyText={variant === "link"}>{label}</Button>}
      databases={databases}
      selectedDatabaseId={selectedDatabase?.id}
      setDatabaseFn={onChange}
    />
  );
};

export default DatabasePicker;
