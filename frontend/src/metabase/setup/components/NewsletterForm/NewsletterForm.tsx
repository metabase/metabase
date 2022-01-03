import React from "react";
import { t } from "ttag";
import Input from "metabase/components/Input";
import {
  FormButton,
  FormInputContainer,
  FormLabel,
  FormLabelCard,
  FormLabelIcon,
  FormLabelText,
  FormMessage,
  FormRoot,
} from "./NewsletterForm.styled";

export interface NewsletterFormProps {
  initialEmail?: string;
}

const NewsletterForm = ({ initialEmail }: NewsletterFormProps): JSX.Element => {
  return (
    <FormRoot>
      <FormLabel>
        <FormLabelCard>
          <FormLabelIcon name="mail" />
          <FormLabelText>{t`Metabase Newsletter`}</FormLabelText>
        </FormLabelCard>
      </FormLabel>
      <FormMessage>
        {t`Get infrequent emails about new releases and feature updates.`}
      </FormMessage>
      <FormInputContainer>
        <Input
          type="email"
          placeholder={t`Email address`}
          defaultValue={initialEmail}
        />
        <FormButton type="submit">{t`Subscribe`}</FormButton>
      </FormInputContainer>
    </FormRoot>
  );
};

export default NewsletterForm;
