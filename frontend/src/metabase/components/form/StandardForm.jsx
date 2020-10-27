import React from "react";

import CustomForm from "./CustomForm";

import { t } from "ttag";

const StandardForm = ({ onClose, submitTitle, ...props }) => (
  <CustomForm {...props}>
    {({ values, formFields, Form, FormField, FormFooter }) => (
      <Form>
        {formFields.map(formField => (
          <FormField key={formField.name} name={formField.name} />
        ))}
        <FormFooter
          footerExtraButtons={props.footerExtraButtons}
          onCancel={onClose}
          submitTitle={
            submitTitle || (values.id != null ? t`Update` : t`Create`)
          }
        />
      </Form>
    )}
  </CustomForm>
);

export default StandardForm;
