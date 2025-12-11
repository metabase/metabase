import { useCallback, useEffect, useMemo, useState } from "react";

import { Form, FormProvider } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import type { DatabaseData, EngineKey } from "metabase-types/api";

import { getEngines } from "../../selectors";
import type { FormLocation } from "../../types";
import { getSubmitValues, getValidationSchema } from "../../utils/schema";

import { DatabaseFormBody } from "./DatabaseFormBody";
import { DatabaseFormFooter } from "./DatabaseFormFooter";
import { FormDirtyStateProvider } from "./context";
import { getEngine, getEngineKey } from "./utils";

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

type ContinueWithoutDataComponent = (props: {
  onCancel?: () => void;
}) => JSX.Element;

interface DatabaseFormProps {
  initialValues?: Partial<DatabaseData>;
  autofocusFieldName?: string;
  onSubmit?: (values: DatabaseData) => void;
  onEngineChange?: (engineKey: string | undefined) => void;
  onCancel?: () => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
  config?: DatabaseFormConfig;
  location: FormLocation;
  /**
   * Whether to show the sample database indicator in the engine list and change the "I'll add my data later" button to "Continue with sample data"
   */
  showSampleDatabase?: boolean;
  /** Slot to replace the button to continue without data/with only sample data */
  ContinueWithoutDataSlot?: ContinueWithoutDataComponent;
}

export const DatabaseForm = ({
  initialValues: initialData,
  autofocusFieldName,
  onSubmit,
  onCancel,
  onEngineChange,
  onDirtyStateChange,
  location,
  showSampleDatabase = false,
  ContinueWithoutDataSlot,
  config = {},
}: DatabaseFormProps): JSX.Element => {
  const isAdvanced = config.isAdvanced || false;
  const engineFieldState = config.engine?.fieldState;

  const engines = useSelector(getEngines);
  const initialEngineKey = useMemo(() => {
    return getEngineKey(engines, initialData, isAdvanced);
  }, [engines, initialData, isAdvanced]);
  const [engineKey, setEngineKey] = useState(initialEngineKey);
  const engine = getEngine(engines, engineKey);

  const validationSchema = useMemo(() => {
    return getValidationSchema(engine, engineKey, isAdvanced);
  }, [engine, engineKey, isAdvanced]);

  const initialValues = useMemo(() => {
    return validationSchema.cast(
      { ...initialData, engine: engineKey },
      { stripUnknown: true },
    );
  }, [initialData, engineKey, validationSchema]);

  useEffect(() => {
    // during page load, if initialData changes, initialEngineKey will also change
    setEngineKey(initialEngineKey);
  }, [initialEngineKey]);

  const handleSubmit = useCallback(
    (values: DatabaseData) => {
      return onSubmit?.(getSubmitValues(engine, values, isAdvanced));
    },
    [engine, isAdvanced, onSubmit],
  );

  const handleEngineChange = useCallback(
    (engineKey: string | undefined) => {
      setEngineKey(engineKey);
      onEngineChange?.(engineKey);
    },
    [onEngineChange],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      enableReinitialize
      onSubmit={handleSubmit}
    >
      <Form
        data-testid="database-form"
        pt={location === "full-page" ? undefined : "md"}
      >
        <FormDirtyStateProvider onDirtyStateChange={onDirtyStateChange}>
          <DatabaseFormBody
            engine={engine}
            // casting won't be needed after migrating all usages of engineKey
            engineKey={engineKey as EngineKey}
            engines={engines}
            engineFieldState={engineFieldState}
            autofocusFieldName={autofocusFieldName}
            isAdvanced={isAdvanced}
            onEngineChange={handleEngineChange}
            config={config}
            showSampleDatabase={showSampleDatabase}
            location={location}
          />
          <DatabaseFormFooter
            ContinueWithoutDataSlot={ContinueWithoutDataSlot}
            isAdvanced={isAdvanced}
            location={location}
            onCancel={onCancel}
            showSampleDatabase={showSampleDatabase}
          />
        </FormDirtyStateProvider>
      </Form>
    </FormProvider>
  );
};
