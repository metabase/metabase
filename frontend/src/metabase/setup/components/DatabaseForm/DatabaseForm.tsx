import React from "react";
import { t } from "ttag";
import Databases from "metabase/entities/databases";
import { DatabaseInfo } from "../../types";
import { FormProps } from "./types";

interface Props {
  database?: DatabaseInfo;
  onSubmit?: (database: DatabaseInfo) => void;
  onCancel?: () => void;
}

const DatabaseForm = ({ database, onSubmit, onCancel }: Props) => {
  return (
    <Databases.Form
      form={Databases.forms.setup}
      database={database}
      onSubmit={onSubmit}
    >
      {({ formFields, Form, FormField, FormFooter }: FormProps) => (
        <Form>
          {formFields.map(({ name }) => (
            <FormField key={name} name={name} />
          ))}
          {
            <FormFooter
              submitTitle={t`Connect database`}
              cancelTitle={t`Skip`}
              onCancel={onCancel}
            />
          }
        </Form>
      )}
    </Databases.Form>
  );
};

export default DatabaseForm;
