import React from "react";
import { t } from "ttag";
import {
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
  console.log(initialEmail);

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
    </FormRoot>
  );
};

export default NewsletterForm;
