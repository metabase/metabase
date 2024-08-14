import { useCallback, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import type { SubscribeInfo } from "metabase-types/store";

import { getUserEmail } from "../../selectors";
import { subscribeToNewsletter } from "../../utils";

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

export const NewsletterForm = (): JSX.Element => {
  const initialEmail = useSelector(getUserEmail);
  const initialValues = { email: initialEmail ?? "" };
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubmit = useCallback(async ({ email }: SubscribeInfo) => {
    await subscribeToNewsletter(email);
    setIsSubscribed(true);
  }, []);

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
