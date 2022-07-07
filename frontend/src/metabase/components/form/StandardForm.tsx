import React from "react";
import { t } from "ttag";

import { BaseFormProps } from "./CustomForm/types";
import { CustomFormFooterProps } from "./CustomForm/CustomFormFooter";
import CustomForm from "./CustomForm";

interface Props extends BaseFormProps, CustomFormFooterProps {
  submitFullWidth?: boolean;
  onClose?: () => void;
}

const StandardForm = ({
  submitTitle,
  submitFullWidth,
  onClose,
  ...props
}: Props) => (
  <CustomForm {...props}>
    {({ values, formFields, Form, FormField, FormFooter }) => (
      <Form>
        {formFields.map(formField => (
          <FormField key={formField.name} name={formField.name} />
        ))}
        <FormFooter
          isModal={props.isModal}
          footerExtraButtons={props.footerExtraButtons}
          onCancel={onClose}
          submitTitle={
            submitTitle || (values.id != null ? t`Update` : t`Create`)
          }
          fullWidth={submitFullWidth}
        />
      </Form>
    )}
  </CustomForm>
);

export default StandardForm;
