import { useFormikContext } from "formik";
import type { LocationDescriptorObject } from "history";
import { useCallback, useEffect, useMemo, useState } from "react";
import { withRouter } from "react-router";

import { Form, type FormProps, FormProvider } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import type { DatabaseData, Engine } from "metabase-types/api";

import { getEngines, getIsHosted } from "../../selectors";
import { getDefaultEngineKey } from "../../utils/engine";
import {
  getSubmitValues,
  getValidationSchema,
  getVisibleFields,
} from "../../utils/schema";
import DatabaseDetailField from "../DatabaseDetailField";
import DatabaseEngineField from "../DatabaseEngineField";
import DatabaseEngineWarning from "../DatabaseEngineWarning";
import DatabaseNameField from "../DatabaseNameField";

export type EngineFieldState = "default" | "hidden" | "disabled";

export interface DatabaseFormConfig {
  /** present the form with advanced configuration options */
  isAdvanced?: boolean;
  engine?: {
    /** present the enginge field as normal, disabled, or hidden */
    fieldState?: EngineFieldState | undefined;
  };
  name?: {
    /** present the name field as a slug */
    isSlug?: boolean;
  };
}

interface DatabaseFormProviderCtx {
  engine: Engine | undefined;
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  onEngineChange: (engine: string | undefined) => void;
  autofocusFieldName: string | undefined;
  isHosted: boolean;
  isAdvanced: boolean;
  isDirty: boolean;
  setIsDirty: (isDirty: boolean) => void;
  onCancel: (() => void) | undefined;
}
interface DatabaseFormProviderProps {
  initialValues?: Partial<DatabaseData>;
  autofocusFieldName?: string;
  onSubmit?: (values: DatabaseData) => void;
  onEngineChange?: (engineKey: string | undefined) => void;
  onCancel?: () => void;
  config?: DatabaseFormConfig;
  children: (ctx: DatabaseFormProviderCtx) => JSX.Element;
  location: LocationDescriptorObject;
}

export const DatabaseFormProvider = withRouter(
  ({
    initialValues: initialData,
    onSubmit,
    onCancel,
    onEngineChange,
    config = {},
    children,
    location,
    ...props
  }: DatabaseFormProviderProps): JSX.Element => {
    const isAdvanced = config.isAdvanced || false;
    const autofocusFieldName =
      location.hash?.slice(1) || props.autofocusFieldName;

    const [isDirty, setIsDirty] = useState(false);

    const engines = useSelector(getEngines);
    const isHosted = useSelector(getIsHosted);
    const initialEngineKey = getEngineKey(engines, initialData, isAdvanced);
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
        {children({
          engine,
          engineKey,
          engines,
          autofocusFieldName,
          isHosted,
          isAdvanced,
          onEngineChange: handleEngineChange,
          onCancel,
          isDirty,
          setIsDirty,
        })}
      </FormProvider>
    );
  },
);

interface DatabaseFormBodyProps extends FormProps {
  engine: Engine | undefined;
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  autofocusFieldName?: string;
  isHosted?: boolean;
  isAdvanced?: boolean;
  onEngineChange: (engineKey: string | undefined) => void;
  setIsDirty?: (isDirty: boolean) => void;
  config?: DatabaseFormConfig;
  footer?: JSX.Element;
}

export const DatabaseForm = ({
  engine,
  engineKey,
  engines,
  autofocusFieldName,
  isHosted = false,
  isAdvanced = false,
  onEngineChange,
  setIsDirty,
  config = {},
  footer,
  ...props
}: DatabaseFormBodyProps): JSX.Element => {
  const { values, dirty } = useFormikContext<DatabaseData>();
  const engineFieldState = config.engine?.fieldState ?? "default";

  useEffect(() => {
    setIsDirty?.(dirty);
  }, [dirty, setIsDirty]);

  const fields = useMemo(() => {
    return engine ? getVisibleFields(engine, values, isAdvanced) : [];
  }, [engine, values, isAdvanced]);

  return (
    <Form {...props} data-testid="database-form">
      {engineFieldState !== "hidden" && (
        <>
          <DatabaseEngineField
            engineKey={engineKey}
            engines={engines}
            isHosted={isHosted}
            isAdvanced={isAdvanced}
            onChange={onEngineChange}
            disabled={engineFieldState === "disabled"}
          />
          <DatabaseEngineWarning
            engineKey={engineKey}
            engines={engines}
            onChange={onEngineChange}
          />
        </>
      )}
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
        />
      ))}
      {footer}
    </Form>
  );
};

const getEngine = (engines: Record<string, Engine>, engineKey?: string) => {
  return engineKey ? engines[engineKey] : undefined;
};

const getEngineKey = (
  engines: Record<string, Engine>,
  values?: Partial<DatabaseData>,
  isAdvanced?: boolean,
) => {
  if (values?.engine) {
    return values.engine;
  } else if (isAdvanced) {
    return getDefaultEngineKey(engines);
  }
};
