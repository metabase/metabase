import React from "react";
import { t } from "ttag";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { DatabaseData, Engine } from "metabase-types/api";
import DatabaseEngineField from "../DatabaseEngineField";
import DatabaseNameField from "../DatabaseNameField";

export interface DatabaseFormProps {
  initialValues: DatabaseData;
  engines: Record<string, Engine>;
  onSubmit: (values: DatabaseData) => void;
}

const DatabaseForm = ({
  initialValues,
  engines,
  onSubmit,
}: DatabaseFormProps): JSX.Element => {
  return (
    <FormProvider initialValues={initialValues} onSubmit={onSubmit}>
      {({ values }) => (
        <Form>
          <DatabaseEngineField engines={engines} />
          {values.engine && (
            <DatabaseNameField engine={values.engine} engines={engines} />
          )}
          <FormSubmitButton title={t`Save`} />
          <FormErrorMessage />
        </Form>
      )}
    </FormProvider>
  );
};

export default DatabaseForm;
