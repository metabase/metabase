import React from "react";
import { t } from "ttag";
import {
  FormLabel,
  FormLabelCard,
  FormLabelIcon,
  FormLabelText,
  FormRoot,
} from "./NewsletterForm.styled";

const NewsletterForm = (): JSX.Element => {
  return (
    <FormRoot>
      <FormLabel>
        <FormLabelCard>
          <FormLabelIcon name="mail" />
          <FormLabelText>{t`Metabase Newsletter`}</FormLabelText>
        </FormLabelCard>
      </FormLabel>
    </FormRoot>
  );
};

export default NewsletterForm;
