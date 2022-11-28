import React, { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { Engine } from "metabase-types/api";
import { DatabaseValues } from "../../types";
import { getValidationSchema, getVisibleFields } from "../../utils";
import DatabaseEngineField from "../DatabaseEngineField";
import DatabaseNameField from "../DatabaseNameField";
import DatabaseDetailField from "../DatabaseDetailField";

export interface DatabaseFormProps {
  engines: Record<string, Engine>;
  onSubmit: (values: DatabaseValues) => void;
}

const DatabaseForm = ({
  engines,
  onSubmit,
}: DatabaseFormProps): JSX.Element => {
  const [engineName, setEngineName] = useState<string | null>(null);
  const engine = engineName ? engines[engineName] : null;

  const validationSchema = useMemo(() => {
    return getValidationSchema(engine, engineName);
  }, [engine, engineName]);

  const initialValues = useMemo(() => {
    return validationSchema.getDefault();
  }, [validationSchema]);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      enableReinitialize
      onSubmit={onSubmit}
    >
      {({ values }) => (
        <DatabaseFormBody
          engine={engine}
          engines={engines}
          values={values}
          onEngineChange={setEngineName}
        />
      )}
    </FormProvider>
  );
};

interface DatabaseFormBodyProps {
  engine: Engine | null;
  engines: Record<string, Engine>;
  values: DatabaseValues;
  onEngineChange: (engineName: string) => void;
}

const DatabaseFormBody = ({
  engine,
  engines,
  values,
  onEngineChange,
}: DatabaseFormBodyProps): JSX.Element => {
  const engineName = values.engine;

  const fields = useMemo(() => {
    return engine ? getVisibleFields(engine, values) : [];
  }, [engine, values]);

  useLayoutEffect(() => {
    engineName && onEngineChange(engineName);
  }, [engineName, onEngineChange]);

  return (
    <Form>
      <DatabaseEngineField engines={engines} />
      {engine && <DatabaseNameField engine={engine} />}
      {fields.map(field => (
        <DatabaseDetailField key={field.name} field={field} />
      ))}
      <FormSubmitButton title={t`Save`} primary />
      <FormErrorMessage />
    </Form>
  );
};

export default DatabaseForm;
