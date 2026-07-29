import { useContext } from "react";
import _ from "underscore";

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

export const getEngineDefaults = (
  engines: Record<string, Engine>,
  engineKey: string | undefined,
  isAdvanced: boolean,
): DatabaseData => {
  const schema = getValidationSchema(
    getEngine(engines, engineKey),
    engineKey,
    isAdvanced,
  );
  return schema.cast({ engine: engineKey }, { stripUnknown: true });
};

/**
 * Values that describe the engine that was selected rather than the connection itself,
 * so they cannot be carried over to another engine.
 */
const ENGINE_SPECIFIC_KEYS = ["engine", "connection-string", "provider_name"];

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

  switch (field.type) {
    case "hidden":
      return false;
    case "integer":
      return typeof value === "number";
    case "boolean":
    case "section":
      return typeof value === "boolean";
    default:
      return typeof value === "string";
  }
};
