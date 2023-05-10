import React, { useCallback, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import FormProvider from "metabase/core/components/FormProvider";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import * as Errors from "metabase/core/utils/errors";
import { SubscribeInfo } from "metabase-types/store";
import {
  EmailForm,
  EmailFormHeader,
  EmailFormLabel,
  EmailFormLabelCard,
  EmailFormLabelIcon,
  EmailFormLabelText,
  EmailFormRoot,
  EmailFormSuccessContainer,
  EmailFormSuccessIcon,
  EmailFormSuccessText,
  EmailFormInput,
} from "./NewsletterForm.styled";

const NEWSLETTER_SCHEMA = Yup.object({
  email: Yup.string().required(Errors.required).email(Errors.email),
});

export interface NewsletterFormProps {
  initialEmail?: string;
  onSubscribe: (email: string) => void;
}

const NewsletterForm = ({
  initialEmail = "",
  onSubscribe,
}: NewsletterFormProps): JSX.Element => {
  const initialValues = { email: initialEmail };
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubmit = useCallback(
    async ({ email }: SubscribeInfo) => {
      await onSubscribe(email);
      setIsSubscribed(true);
    },
    [onSubscribe],
  );

  return (
    <EmailFormRoot>
      <EmailFormLabel>
        <EmailFormLabelCard>
          <EmailFormLabelIcon name="mail" />
          <EmailFormLabelText>{t`Metabase Newsletter`}</EmailFormLabelText>
        </EmailFormLabelCard>
      </EmailFormLabel>
      <EmailFormHeader>
        {t`Get infrequent emails about new releases and feature updates.`}
      </EmailFormHeader>
      {!isSubscribed && (
        <FormProvider
          initialValues={initialValues}
          validationSchema={NEWSLETTER_SCHEMA}
          onSubmit={handleSubmit}
        >
          <EmailForm>
            <EmailFormInput
              name="email"
              type="email"
              placeholder="nicetoseeyou@email.com"
              autoFocus
            />
            <FormSubmitButton title={t`Subscribe`} />
          </EmailForm>
        </FormProvider>
      )}
      {isSubscribed && (
        <EmailFormSuccessContainer>
          <EmailFormSuccessIcon name="check" />
          <EmailFormSuccessText>
            {t`You're subscribed. Thanks for using Metabase!`}
          </EmailFormSuccessText>
        </EmailFormSuccessContainer>
      )}
    </EmailFormRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewsletterForm;
