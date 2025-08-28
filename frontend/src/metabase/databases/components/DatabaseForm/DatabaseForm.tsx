import { useFormikContext } from "formik";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";

import { Form, FormProvider } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import type { DatabaseData, EngineKey } from "metabase-types/api";

import { getEngines } from "../../selectors";
import { getSubmitValues, getValidationSchema } from "../../utils/schema";

import { DatabaseFormBody } from "./DatabaseFormBody";
import { DatabaseFormFooter } from "./DatabaseFormFooter";
import {
  type ContinueWithoutDataComponent,
  type DatabaseFormConfig,
  getEngine,
  getEngineKey,
} from "./utils";

interface DatabaseFormProps {
  initialValues?: Partial<DatabaseData>;
  autofocusFieldName?: string;
  onSubmit?: (values: DatabaseData) => void;
  onEngineChange?: (engineKey: string | undefined) => void;
  onCancel?: () => void;
  setIsDirty?: (isDirty: boolean) => void;
  config?: DatabaseFormConfig;
  location: "admin" | "setup" | "embedding_setup";
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
  setIsDirty,
  location,
  showSampleDatabase = false,
  ContinueWithoutDataSlot,
  config = {},
}: DatabaseFormProps): JSX.Element => {
  const { dirty } = useFormikContext<DatabaseData>();
  const isAdvanced = config.isAdvanced || false;
  const engineFieldState = config.engine?.fieldState;

  const engines = useSelector(getEngines);
  const initialEngineKey = getEngineKey(engines, initialData, isAdvanced);
  const [engineKey, setEngineKey] = useState(initialEngineKey);
  const engine = getEngine(engines, engineKey);

  useEffect(() => {
    setIsDirty?.(dirty);
  }, [dirty, setIsDirty]);

  const validationSchema = useMemo(() => {
    return getValidationSchema(engine, engineKey, isAdvanced);
  }, [engine, engineKey, isAdvanced]);

  const initialValues = useMemo(() => {
    return validationSchema.cast(
      { ...initialData, engine: engineKey },
      { stripUnknown: true },
    );
  }, [initialData, engineKey, validationSchema]);

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
      <Form data-testid="database-form" pt="md">
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
          isDirty={dirty}
          isAdvanced={isAdvanced}
          onCancel={onCancel}
          showSampleDatabase={showSampleDatabase}
          ContinueWithoutDataSlot={ContinueWithoutDataSlot}
        />
      </Form>
    </FormProvider>
  );
};
