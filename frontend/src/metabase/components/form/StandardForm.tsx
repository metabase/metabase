import React from "react";
import { t } from "ttag";

import { BaseFieldValues } from "metabase-types/forms";

import { BaseFormProps } from "./CustomForm/types";
import { CustomFormFooterProps } from "./CustomForm/CustomFormFooter";
import CustomForm from "./CustomForm";

interface Props<Values extends BaseFieldValues>
  extends BaseFormProps<Values>,
    CustomFormFooterProps {
  submitFullWidth?: boolean;
  onClose?: () => void;
}

function StandardForm<Values extends BaseFieldValues>({
  submitTitle,
  submitFullWidth,
  onClose,
  ...props
}: Props<Values>) {
  return (
    <CustomForm<Values> {...props}>
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
}

export default StandardForm;
