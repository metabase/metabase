import { useFormikContext } from "formik";
import { type JSX, useEffect, useMemo } from "react";

import { getVisibleFields } from "metabase/databases/utils/schema";
import { Box } from "metabase/ui";
import type { DatabaseData, Engine, EngineKey } from "metabase-types/api";

import { DatabaseConnectionStringField } from "../DatabaseConnectionUri";
import DatabaseDetailField from "../DatabaseDetailField";
import { DatabaseEngineField } from "../DatabaseEngineField";
import DatabaseEngineWarning from "../DatabaseEngineWarning";
import { DatabaseNameField } from "../DatabaseNameField";

import { DatabaseFormError } from "./DatabaseFormError";
import { type DatabaseFormConfig, useHasConnectionError } from "./utils";

interface DatabaseFormBodyProps {
  engine: Engine | undefined;
  engineKey: EngineKey | undefined;
  engines: Record<string, Engine>;
  engineFieldState?: "default" | "hidden" | "disabled";
  autofocusFieldName?: string;
  isAdvanced: boolean;
  onEngineChange: (engineKey: string | undefined) => void;
  config: DatabaseFormConfig;
  setIsDirty?: (dirty: boolean) => void;
  showSampleDatabase?: boolean;
  location: "admin" | "setup" | "embedding_setup";
}

export const DatabaseFormBody = ({
  engine,
  engineKey,
  engines,
  engineFieldState = "default",
  autofocusFieldName,
  isAdvanced,
  onEngineChange,
  config,
  setIsDirty,
  showSampleDatabase = false,
  location,
}: DatabaseFormBodyProps): JSX.Element => {
  const { values, dirty, setValues } = useFormikContext<DatabaseData>();
  const hasConnectionError = useHasConnectionError();

  useEffect(() => {
    setIsDirty?.(dirty);
  }, [dirty, setIsDirty]);

  const fields = useMemo(() => {
    return engine ? getVisibleFields(engine, values, isAdvanced) : [];
  }, [engine, values, isAdvanced]);

  return (
    <Box
      id="scrollable-database-form-body"
      mah="calc(100vh - 20rem)"
      mb="md"
      px={location === "setup" ? "sm" : "xl"}
      style={{ overflowY: "auto", position: "relative" }}
    >
      {engineFieldState !== "hidden" && (
        <>
          <DatabaseEngineField
            engineKey={engineKey}
            engines={engines}
            isAdvanced={isAdvanced}
            onChange={onEngineChange}
            disabled={engineFieldState === "disabled"}
            showSampleDatabase={showSampleDatabase}
          />
          <DatabaseEngineWarning
            engineKey={engineKey}
            engines={engines}
            onChange={onEngineChange}
          />
        </>
      )}
      <DatabaseConnectionStringField
        engineKey={engineKey}
        location={location}
        setValues={setValues}
      />
      {engine && (
        <DatabaseNameField
          engine={engine}
          config={config}
          autoFocus={autofocusFieldName === "name"}
        />
      )}
      {fields.map((field) => (
        <DatabaseDetailField
          key={field.name}
          field={field}
          autoFocus={autofocusFieldName === field.name}
          data-kek={field.name}
          engineKey={engineKey}
          engine={engine}
        />
      ))}
      {location === "admin" && hasConnectionError && <DatabaseFormError />}
    </Box>
  );
};
