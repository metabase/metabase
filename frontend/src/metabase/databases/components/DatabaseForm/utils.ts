import { useContext } from "react";

import { getDefaultEngineKey } from "metabase/databases/utils/engine";
import { useFormErrorMessage } from "metabase/forms";
import type { DatabaseData, Engine } from "metabase-types/api";

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
