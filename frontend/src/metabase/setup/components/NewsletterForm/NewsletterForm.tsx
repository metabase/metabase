import React, { useState } from "react";
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
}

const NewsletterForm = ({ initialEmail }: NewsletterFormProps): JSX.Element => {
  const [isSubmitted] = useState(false);

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
      {!isSubmitted && (
        <FormInputContainer>
          <Input
            type="email"
            defaultValue={initialEmail}
            placeholder={t`Email address`}
            fullWidth
          />
          <FormInputButton type="submit">{t`Subscribe`}</FormInputButton>
        </FormInputContainer>
      )}
      {isSubmitted && (
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
