import React from "react";

import CustomForm from "./CustomForm";

import Button from "metabase/components/Button";

import { t } from "ttag";

const StandardForm = ({ onClose, submitTitle, ...props }) => (
  <CustomForm {...props}>
    {({ values, formFields, Form, FormField, FormMessage, FormSubmit }) => (
      <Form>
        <div>
          {formFields.map(formField => (
            <FormField key={formField.name} name={formField.name} />
          ))}
        </div>
        <div className="flex">
          <div className="ml-auto flex align-center">
            <FormMessage />
            {onClose && (
              <Button className="mr1" onClick={onClose}>{t`Cancel`}</Button>
            )}
            <FormSubmit>
              {submitTitle || (values.id != null ? t`Update` : t`Create`)}
            </FormSubmit>
          </div>
        </div>
      </Form>
    )}
  </CustomForm>
);

export default StandardForm;
