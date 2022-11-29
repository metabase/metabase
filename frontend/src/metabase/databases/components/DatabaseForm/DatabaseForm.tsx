import React, { useMemo, useState } from "react";
import { useFormikContext } from "formik";
import { t } from "ttag";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { Engine } from "metabase-types/api";
import { DatabaseValues } from "../../types";
import { getValidationSchema, getVisibleFields } from "../../utils/schema";
import DatabaseEngineField from "../DatabaseEngineField";
import DatabaseNameField from "../DatabaseNameField";
import DatabaseDetailField from "../DatabaseDetailField";
import DatabaseEngineWarning from "../DatabaseEngineWarning";

export interface DatabaseFormProps {
  engines: Record<string, Engine>;
  isHosted?: boolean;
  isAdvanced?: boolean;
  onSubmit: (values: DatabaseValues) => void;
}

const DatabaseForm = ({
  engines,
  isHosted = false,
  isAdvanced = false,
  onSubmit,
}: DatabaseFormProps): JSX.Element => {
  const [engineKey, setEngineKey] = useState<string>();
  const engine = engineKey ? engines[engineKey] : undefined;

  const validationSchema = useMemo(() => {
    return getValidationSchema(engine, engineKey);
  }, [engine, engineKey]);

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
      <DatabaseFormBody
        engine={engine}
        engineKey={engineKey}
        engines={engines}
        isHosted={isHosted}
        isAdvanced={isAdvanced}
        onEngineChange={setEngineKey}
      />
    </FormProvider>
  );
};

interface DatabaseFormBodyProps {
  engine: Engine | undefined;
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  isHosted: boolean;
  isAdvanced: boolean;
  onEngineChange: (engineKey: string | undefined) => void;
}

const DatabaseFormBody = ({
  engine,
  engineKey,
  engines,
  isHosted,
  isAdvanced,
  onEngineChange,
}: DatabaseFormBodyProps): JSX.Element => {
  const { values, dirty } = useFormikContext<DatabaseValues>();

  const fields = useMemo(() => {
    return engine ? getVisibleFields(engine, values) : [];
  }, [engine, values]);

  return (
    <Form disabled={!dirty}>
      <DatabaseEngineField
        engineKey={engineKey}
        engines={engines}
        isHosted={isHosted}
        isAdvanced={isAdvanced}
        onChange={onEngineChange}
      />
      {!isAdvanced && (
        <DatabaseEngineWarning
          engineKey={engineKey}
          engines={engines}
          onChange={onEngineChange}
        />
      )}
      {engine && <DatabaseNameField engine={engine} />}
      {fields.map(field => (
        <DatabaseDetailField key={field.name} field={field} />
      ))}
      <FormSubmitButton title={t`Save`} disabled={!dirty} primary />
      <FormErrorMessage />
    </Form>
  );
};

export default DatabaseForm;
