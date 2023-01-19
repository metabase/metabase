import React from "react";
import { t } from "ttag";
import * as Yup from "yup";

import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormTextArea from "metabase/core/components/FormTextArea";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import * as Errors from "metabase/core/utils/errors";
import { Link } from "metabase-types/api";
import { ExternalLinkFormSubmitContainer } from "./ExternalLinkForm.styled";

const EXTERNAL_LINK_SCHEMA = Yup.object({
  url: Yup.string().required(Errors.required),
  name: Yup.string().required(Errors.required).max(255, Errors.maxLength),
  description: Yup.string().nullable().max(255, Errors.maxLength),
});

export interface ExternalLinkFormProps {
  initialValues?: Partial<Link>;
  onSubmit: (data: any) => void;
  onArchive?: () => void;
  onCancel?: () => void;
  isNew?: boolean;
}

const ExternalLinkForm = ({
  initialValues = {},
  onSubmit,
  isNew,
}: ExternalLinkFormProps) => {
  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={EXTERNAL_LINK_SCHEMA}
      onSubmit={onSubmit}
    >
      {({ dirty }) => (
        <Form disabled={!dirty}>
          <FormInput
            autoFocus
            name="url"
            title={t`URL`}
            placeholder={t`https://metabase.com/`}
          />
          <FormInput name="name" title={t`Name`} placeholder={t`Link name`} />
          <FormTextArea
            name="description"
            title={t`Description`}
            nullable
            placeholder={t`Metabase.com home page`}
          />

          <ExternalLinkFormSubmitContainer>
            <FormSubmitButton
              title={isNew ? t`Add` : t`Update`}
              disabled={!dirty}
              primary
            />
          </ExternalLinkFormSubmitContainer>
        </Form>
      )}
    </FormProvider>
  );
};

export default ExternalLinkForm;
