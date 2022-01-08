import React, { ChangeEvent, SyntheticEvent, useState } from "react";
import { t } from "ttag";
import Input from "metabase/components/Input";
import {
  FormInputButton,
  FormInputContainer,
  FormLabel,
  FormLabelCard,
  FormLabelIcon,
  FormLabelText,
  FormHeader,
  FormRoot,
  FormSuccessContainer,
  FormSuccessIcon,
  FormSuccessText,
} from "./NewsletterForm.styled";

export interface NewsletterFormProps {
  initialEmail?: string;
  onSubscribe: (email: string) => void;
}

const NewsletterForm = ({
  initialEmail = "",
  onSubscribe,
}: NewsletterFormProps): JSX.Element => {
  const [email, setEmail] = useState(initialEmail);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.currentTarget.value);
  };

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    onSubscribe(email);
    setIsSubscribed(true);
  };

  return (
    <FormRoot onSubmit={onSubmit}>
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
        <FormInputContainer>
          <Input
            name="email"
            type="email"
            defaultValue={initialEmail}
            placeholder={t`Email address`}
            fullWidth
            onChange={onChange}
          />
          <FormInputButton type="submit">{t`Subscribe`}</FormInputButton>
        </FormInputContainer>
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
