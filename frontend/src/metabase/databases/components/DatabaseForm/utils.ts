import { useContext } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import type { DatabaseFormValues } from "metabase/databases/types";
import { getDefaultEngineKey } from "metabase/databases/utils/engine";
import {
  getFlattenedFields,
  getValidationSchema,
} from "metabase/databases/utils/schema";
import { useFormErrorMessage } from "metabase/forms";
import type { DatabaseData, Engine, EngineField } from "metabase-types/api";

import { FormDirtyStateContext } from "./context";

export const useHasConnectionError = () => {
  const errorMessage = useFormErrorMessage();
  return !!errorMessage;
};

export const getEngine = (
  engines: Record<string, Engine>,
  engineKey?: string,
) => {
  return engineKey ? engines[engineKey] : undefined;
};

export const getEngineKey = (
  engines: Record<string, Engine>,
  values?: Partial<DatabaseData>,
  isAdvanced?: boolean,
) => {
  if (values?.engine && Object.keys(engines).includes(values.engine)) {
    return values.engine;
  } else if (isAdvanced) {
    return getDefaultEngineKey(engines);
  }
};

export const useIsFormDirty = () => {
  return useContext(FormDirtyStateContext);
};

export const castEngineValues = (
  engines: Record<string, Engine>,
  values: Partial<DatabaseData>,
  isAdvanced: boolean,
): DatabaseData => {
  const engineKey = values.engine;
  const schema = getValidationSchema(
    getEngine(engines, engineKey),
    engineKey,
    isAdvanced,
  );
  return schema.cast(values, { stripUnknown: true });
};

export const getEngineDefaults = (
  engines: Record<string, Engine>,
  engineKey: string | undefined,
  isAdvanced: boolean,
): DatabaseData => castEngineValues(engines, { engine: engineKey }, isAdvanced);

/**
 * Values that describe the engine that was selected rather than the connection itself,
 * so they cannot be carried over to another engine.
 */
const ENGINE_SPECIFIC_KEYS: (keyof DatabaseFormValues)[] = [
  "engine",
  "connection-string",
  "provider_name",
];

export const mergeRetainedValues = (
  previousValues: DatabaseData,
  defaultValues: DatabaseData,
  engine: Engine | undefined,
): DatabaseData => {
  const fields: Record<string, EngineField | undefined> = _.indexBy(
    getFlattenedFields(engine?.["details-fields"] ?? []),
    "name",
  );

  const details = _.mapObject(
    defaultValues.details ?? {},
    (defaultValue, name) => {
      const value = previousValues.details?.[name];
      return canRetainDetail(fields[name], value) ? value : defaultValue;
    },
  );

  return {
    ...defaultValues,
    ..._.omit(previousValues, ENGINE_SPECIFIC_KEYS),
    details,
  };
};

const canRetainDetail = (field: EngineField | undefined, value: unknown) => {
  if (field == null || value == null) {
    return false;
  }

  return match(field.type)
    .with("hidden", () => false)
    .with("integer", () => typeof value === "number")
    .with("boolean", "section", () => typeof value === "boolean")
    .with(
      "string",
      "password",
      "text",
      "select",
      "textFile",
      "info",
      undefined,
      () => typeof value === "string",
    )
    .exhaustive();
};
