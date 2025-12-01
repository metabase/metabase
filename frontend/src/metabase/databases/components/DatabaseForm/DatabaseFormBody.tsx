import { useFormikContext } from "formik";
import { type JSX, useEffect, useMemo } from "react";
import { match } from "ts-pattern";

import type {
  DatabaseFormConfig,
  FormLocation,
} from "metabase/databases/types";
import { getVisibleFields } from "metabase/databases/utils/schema";
import { Box } from "metabase/ui";
import type { DatabaseData, Engine, EngineKey } from "metabase-types/api";

import { DatabaseConnectionStringField } from "../DatabaseConnectionUri";
import { DatabaseDetailField } from "../DatabaseDetailField";
import { DatabaseEngineField } from "../DatabaseEngineField";
import DatabaseEngineWarning from "../DatabaseEngineWarning";
import { DatabaseFormError } from "../DatabaseFormError";
import { DatabaseNameField } from "../DatabaseNameField";

import { useHasConnectionError } from "./utils";

interface DatabaseFormBodyProps {
  engine: Engine | undefined;
  engineKey: EngineKey | undefined;
  engines: Record<string, Engine>;
  engineFieldState?: "default" | "hidden" | "disabled";
  autofocusFieldName?: string;
  isAdvanced: boolean;
  onEngineChange: (engineKey: string | undefined) => void;
  setIsDirty?: (isDirty: boolean) => void;
  config: DatabaseFormConfig;
  showSampleDatabase?: boolean;
  location: FormLocation;
}

export const DatabaseFormBody = ({
  engine,
  engineKey,
  engines,
  engineFieldState = "default",
  autofocusFieldName,
  isAdvanced,
  onEngineChange,
  setIsDirty,
  config,
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

  const px = match(location)
    .with("setup", () => "sm")
    .with("embedding_setup", () => "xl")
    .with("admin", () => "xl")
    .with("full-page", () => undefined)
    .exhaustive();
  const mah = location === "full-page" ? "100%" : "calc(100vh - 20rem)";

  return (
    <Box mah={mah} mb="md" px={px} style={{ overflowY: "auto" }}>
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
      {isAdvanced && hasConnectionError && <DatabaseFormError />}
    </Box>
  );
};
