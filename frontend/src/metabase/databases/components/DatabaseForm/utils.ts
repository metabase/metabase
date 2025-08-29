import { getDefaultEngineKey } from "metabase/databases/utils/engine";
import { useFormErrorMessage } from "metabase/forms";
import type { DatabaseData, Engine } from "metabase-types/api";

export type ContinueWithoutDataComponent = (props: {
  onCancel?: () => void;
}) => JSX.Element;

export type EngineFieldState = "default" | "hidden" | "disabled";

export interface DatabaseFormConfig {
  /** present the form with advanced configuration options */
  isAdvanced?: boolean;
  engine?: {
    /** present the engine field as normal, disabled, or hidden */
    fieldState?: EngineFieldState | undefined;
  };
  name?: {
    /** present the name field as a slug */
    isSlug?: boolean;
  };
}

export const useHasConnectionError = () => {
  const originalErrorMessage = useFormErrorMessage();
  return !!originalErrorMessage;
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
