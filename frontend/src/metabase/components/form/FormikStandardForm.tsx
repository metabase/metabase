import React from "react";
import { t } from "ttag";

import { BaseFieldValues } from "metabase-types/forms";

import { BaseFormProps } from "./FormikCustomForm/types";
import { CustomFormFooterProps } from "./FormikCustomForm/CustomFormFooter";
import CustomForm from "./FormikCustomForm";

interface Props<Values extends BaseFieldValues>
  extends BaseFormProps<Values>,
    CustomFormFooterProps {
  submitFullWidth?: boolean;
  onClose?: () => void;
}

/**
 * @deprecated
 */
function StandardForm<Values extends BaseFieldValues>({
  submitTitle,
  submitFullWidth,
  onClose,
  ...props
}: Props<Values>) {
  return (
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
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StandardForm;
