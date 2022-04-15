import React, { useState } from "react";
import { t } from "ttag";
import Users from "metabase/entities/users";
import Form from "metabase/containers/Form";
import { SubscribeInfo } from "metabase-types/store";
import {
  FormContainer,
  FormFieldContainer,
  FormHeader,
  FormLabel,
  FormLabelCard,
  FormLabelIcon,
  FormLabelText,
  FormRoot,
  FormSuccessContainer,
  FormSuccessIcon,
  FormSuccessText,
} from "./NewsletterForm.styled";
import { FormProps } from "./types";

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

  const onSubmit = async ({ email }: SubscribeInfo) => {
    await onSubscribe(email);
    setIsSubscribed(true);
  };

  return (
    <FormRoot>
      <FormLabel>
        <FormLabelCard>
          <FormLabelIcon name="mail" />
          <FormLabelText>{t`Metabase Newsletter`}</FormLabelText>
        </FormLabelCard>
      </FormLabel>
      <FormHeader>
        {t`Get infrequent emails about new releases and feature updates.`}
      </FormHeader>
      {!isSubscribed && (
        <Form
          form={Users.forms.newsletter}
          initialValues={initialValues}
          submitTitle={t`Subscribe`}
          onSubmit={onSubmit}
        >
          {({ Form, FormField, FormSubmit }: FormProps) => (
            <Form>
              <FormContainer>
                <FormFieldContainer>
                  <FormField name="email" />
                </FormFieldContainer>
                <FormSubmit primary={false} />
              </FormContainer>
            </Form>
          )}
        </Form>
      )}
      {isSubscribed && (
        <FormSuccessContainer>
          <FormSuccessIcon name="check" />
          <FormSuccessText>
            {t`You're subscribed. Thanks for using Metabase!`}
          </FormSuccessText>
        </FormSuccessContainer>
      )}
    </FormRoot>
  );
};

export default NewsletterForm;
