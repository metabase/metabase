import React from "react";
import { t } from "ttag";
import { Database } from "metabase-types/api";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import Button from "metabase/core/components/Button";

type MetabotDatabasePickerProps = {
  databases: Database[];
  selectedDatabase?: Database;
  variant?: "link" | "button";
  inline?: boolean;
  onChange: (databaseId: number) => void;
};

const MetabotDatabasePicker = ({
  databases,
  selectedDatabase,
  variant = "button",
  inline,
  onChange,
}: MetabotDatabasePickerProps) => {
  const label =
    selectedDatabase != null ? selectedDatabase.name : t`Pick a database`;

  return (
    <DatabaseDataSelector
      triggerClasses={inline ? "inline" : undefined}
      triggerElement={<Button onlyText={variant === "link"}>{label}</Button>}
      databases={databases}
      selectedDatabaseId={selectedDatabase?.id}
      setDatabaseFn={onChange}
    />
  );
};

export default MetabotDatabasePicker;
