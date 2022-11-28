import React, { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { DatabaseData, Engine } from "metabase-types/api";
import DatabaseEngineField from "../DatabaseEngineField";
import DatabaseNameField from "../DatabaseNameField";
import DatabaseDetailField from "../DatabaseDetailField";
import { getSchema } from "../../utils/getSchema";
import { getVisibleFields } from "../../utils/getVisibleFields";

export interface DatabaseFormProps {
  engines: Record<string, Engine>;
  onSubmit: (values: DatabaseData) => void;
}

const DatabaseForm = ({
  engines,
  onSubmit,
}: DatabaseFormProps): JSX.Element => {
  const [engineName, setEngineName] = useState<string | null>(null);
  const engine = engineName ? engines[engineName] : null;

  const schema = useMemo(() => {
    return getSchema(engine, engineName);
  }, [engine, engineName]);

  const fields = useMemo(() => {
    return engine ? getVisibleFields(engine) : [];
  }, [engine]);

  const initialValues = useMemo(() => {
    return schema.getDefault();
  }, [schema]);

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={schema}
      enableReinitialize
      onSubmit={onSubmit}
    >
      {({ values }) => {
        setEngineName(values.engine);

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
      }}
    </FormProvider>
  );
};

export default DatabaseForm;
