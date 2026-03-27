import { useFormikContext } from "formik";
import type { JSX } from "react";
import { match } from "ts-pattern";

import type {
  DatabaseFormConfig,
  FormLocation,
} from "metabase/databases/types";
import { Box } from "metabase/ui";
import type { DatabaseData, Engine, EngineKey } from "metabase-types/api";

import { DatabaseConnectionStringField } from "../DatabaseConnectionUri";
import { DatabaseEngineField } from "../DatabaseEngineField";
import DatabaseEngineWarning from "../DatabaseEngineWarning";
import { DatabaseFormError } from "../DatabaseFormError";
import { DatabaseNameField } from "../DatabaseNameField";

import { DatabaseFormBodyDetails } from "./DatabaseFormBodyDetails";
import { useHasConnectionError } from "./utils";

interface DatabaseFormBodyProps {
  engine: Engine | undefined;
  engineKey: EngineKey | undefined;
  engines: Record<string, Engine>;
  autofocusFieldName?: string;
  isAdvanced: boolean;
  onEngineChange: (engineKey: string | undefined) => void;
  config: DatabaseFormConfig;
  showSampleDatabase?: boolean;
  location: FormLocation;
}

export const DatabaseFormBody = ({
  engine,
  engineKey,
  engines,
  autofocusFieldName,
  isAdvanced,
  onEngineChange,
  config,
  showSampleDatabase = false,
  location,
}: DatabaseFormBodyProps): JSX.Element => {
  const { setValues } = useFormikContext<DatabaseData>();
  const hasConnectionError = useHasConnectionError();
  const { engine: engineFieldConfig, name: nameFieldConfig } = config;

  const px = match(location)
    .with("setup", () => "sm")
    .with("embedding_setup", () => "xl")
    .with("admin", () => "xl")
    .with("full-page", () => undefined)
    .exhaustive();
  const mah = location === "full-page" ? "100%" : "calc(100vh - 20rem)";

  return (
    <Box mah={mah} mb="md" px={px} style={{ overflowY: "auto" }}>
      {engineFieldConfig?.fieldState !== "hidden" && (
        <>
          <DatabaseEngineField
            engineKey={engineKey}
            engines={engines}
            isAdvanced={isAdvanced}
            onChange={onEngineChange}
            disabled={engineFieldConfig?.fieldState === "disabled"}
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
      {engine && nameFieldConfig?.fieldState !== "hidden" && (
        <DatabaseNameField
          engine={engine}
          config={config}
          autoFocus={autofocusFieldName === "name"}
        />
      )}
      <DatabaseFormBodyDetails
        fields={engine?.["details-fields"] ?? []}
        autofocusFieldName={autofocusFieldName}
        engineKey={engineKey}
        engine={engine}
        isAdvanced={isAdvanced}
      />
      {isAdvanced && hasConnectionError && <DatabaseFormError />}
    </Box>
  );
};
