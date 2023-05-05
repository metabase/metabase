import React, { useCallback, useMemo, useState } from "react";
import { useFormikContext } from "formik";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormFooter from "metabase/core/components/FormFooter";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { PLUGIN_CACHING } from "metabase/plugins";
import { DatabaseData, Engine } from "metabase-types/api";
import { getDefaultEngineKey } from "../../utils/engine";
import {
  getSubmitValues,
  getValidationSchema,
  getVisibleFields,
} from "../../utils/schema";
import DatabaseEngineField from "../DatabaseEngineField";
import DatabaseNameField from "../DatabaseNameField";
import DatabaseDetailField from "../DatabaseDetailField";
import DatabaseEngineWarning from "../DatabaseEngineWarning";
import { LinkButton, LinkFooter } from "./DatabaseForm.styled";

export interface DatabaseFormProps {
  engines: Record<string, Engine>;
  initialValues?: DatabaseData;
  autofocusFieldName?: string;
  isHosted?: boolean;
  isAdvanced?: boolean;
  isCachingEnabled?: boolean;
  onSubmit?: (values: DatabaseData) => void;
  onEngineChange?: (engineKey: string | undefined) => void;
  onCancel?: () => void;
}

const DatabaseForm = ({
  engines,
  initialValues: initialData,
  autofocusFieldName,
  isHosted = false,
  isAdvanced = false,
  isCachingEnabled = false,
  onSubmit,
  onCancel,
  onEngineChange,
}: DatabaseFormProps): JSX.Element => {
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
      <DatabaseFormBody
        engine={engine}
        engineKey={engineKey}
        engines={engines}
        autofocusFieldName={autofocusFieldName}
        isHosted={isHosted}
        isAdvanced={isAdvanced}
        isCachingEnabled={isCachingEnabled}
        onEngineChange={handleEngineChange}
        onCancel={onCancel}
      />
    </FormProvider>
  );
};

interface DatabaseFormBodyProps {
  engine: Engine | undefined;
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  autofocusFieldName?: string;
  isHosted: boolean;
  isAdvanced: boolean;
  isCachingEnabled: boolean;
  onEngineChange: (engineKey: string | undefined) => void;
  onCancel?: () => void;
}

const DatabaseFormBody = ({
  engine,
  engineKey,
  engines,
  autofocusFieldName,
  isHosted,
  isAdvanced,
  isCachingEnabled,
  onEngineChange,
  onCancel,
}: DatabaseFormBodyProps): JSX.Element => {
  const { values } = useFormikContext<DatabaseData>();

  const fields = useMemo(() => {
    return engine ? getVisibleFields(engine, values, isAdvanced) : [];
  }, [engine, values, isAdvanced]);

  return (
    <Form>
      <DatabaseEngineField
        engineKey={engineKey}
        engines={engines}
        isHosted={isHosted}
        isAdvanced={isAdvanced}
        onChange={onEngineChange}
      />
      <DatabaseEngineWarning
        engineKey={engineKey}
        engines={engines}
        onChange={onEngineChange}
      />
      {engine && <DatabaseNameField engine={engine} />}
      {fields.map(field => (
        <DatabaseDetailField
          key={field.name}
          field={field}
          autoFocus={field.name === autofocusFieldName}
          data-kek={field.name}
        />
      ))}
      {isCachingEnabled && <PLUGIN_CACHING.DatabaseCacheTimeField />}
      <DatabaseFormFooter isAdvanced={isAdvanced} onCancel={onCancel} />
    </Form>
  );
};

interface DatabaseFormFooterProps {
  isAdvanced: boolean;
  onCancel?: () => void;
}

const DatabaseFormFooter = ({
  isAdvanced,
  onCancel,
}: DatabaseFormFooterProps) => {
  const { values } = useFormikContext<DatabaseData>();
  const isNew = values.id == null;

  if (isAdvanced) {
    return (
      <div>
        <FormSubmitButton title={isNew ? t`Save` : t`Save changes`} primary />
        <FormErrorMessage />
      </div>
    );
  } else if (values.engine) {
    return (
      <FormFooter>
        <FormErrorMessage inline />
        <Button type="button" onClick={onCancel}>{t`Skip`}</Button>
        <FormSubmitButton title={t`Connect database`} primary />
      </FormFooter>
    );
  } else {
    return (
      <LinkFooter>
        <LinkButton type="button" onClick={onCancel}>
          {t`I'll add my data later`}
        </LinkButton>
      </LinkFooter>
    );
  }
};

const getEngine = (engines: Record<string, Engine>, engineKey?: string) => {
  return engineKey ? engines[engineKey] : undefined;
};

const getEngineKey = (
  engines: Record<string, Engine>,
  values?: DatabaseData,
  isAdvanced?: boolean,
) => {
  if (values?.engine) {
    return values.engine;
  } else if (isAdvanced) {
    return getDefaultEngineKey(engines);
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseForm;
