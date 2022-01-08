import React from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import { SlackSettings } from "metabase-types/api";
import { getSlackForm } from "../../forms";
import { FormProps } from "./types";
import { FormMessage } from "./SlackSetupForm.styled";

export interface SlackSetupFormProps {
  onSubmit: (data: SlackSettings) => void;
}

const SlackSetupForm = ({ onSubmit }: SlackSetupFormProps): JSX.Element => {
  const form = getSlackForm();

  return (
    <Form form={form} onSubmit={onSubmit}>
      {({ Form, FormField, FormFooter }: FormProps) => (
        <Form>
          <FormField name="token" />
          <FormMessage>
            {t`Finally, open Slack and create a public channel and put its name below.`}
          </FormMessage>
          <FormField name="channel" />
          <FormFooter submitTitle={t`Save changes`} />
        </Form>
      )}
    </Form>
  );
};

export default SlackSetupForm;
