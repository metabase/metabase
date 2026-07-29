import { useCallback, useMemo } from "react";
import _ from "underscore";

import { Form, FormProvider } from "metabase/forms";
import { useSelector } from "metabase/redux";
import type { DatabaseData } from "metabase-types/api";

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

  const engines = useSelector(getEngines);
  const initialEngineKey = useMemo(() => {
    return getEngineKey(engines, initialData, isAdvanced);
  }, [engines, initialData, isAdvanced]);

  const getSchema = useMemo(() => {
    return _.memoize((engineKey: string | undefined) =>
      getValidationSchema(getEngine(engines, engineKey), engineKey, isAdvanced),
    );
  }, [engines, isAdvanced]);

  // The form's shape depends on the engine, so the schema has to follow `values.engine`.
  const validationSchema = useCallback(
    (values: DatabaseData) => getSchema(values.engine),
    [getSchema],
  );

  const initialValues = useMemo(() => {
    return getSchema(initialEngineKey).cast(
      { ...initialData, engine: initialEngineKey },
      { stripUnknown: true },
    );
  }, [getSchema, initialData, initialEngineKey]);

  const handleSubmit = useCallback(
    (values: DatabaseData) => {
      const engine = getEngine(engines, values.engine);
      return onSubmit?.(getSubmitValues(engine, values, isAdvanced));
    },
    [engines, isAdvanced, onSubmit],
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
        mih={0}
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <FormDirtyStateProvider onDirtyStateChange={onDirtyStateChange}>
          <DatabaseFormBody
            engines={engines}
            autofocusFieldName={autofocusFieldName}
            isAdvanced={isAdvanced}
            onEngineChange={onEngineChange}
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
