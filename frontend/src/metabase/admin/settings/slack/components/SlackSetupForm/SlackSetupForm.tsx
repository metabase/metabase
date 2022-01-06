import React, { useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/Form";
import { getSlackForm } from "../../forms";
import { SlackData } from "../../types";
import { FormProps } from "./types";

export interface SlackSetupFormProps {
  onSubmit: (data: SlackData) => void;
}

const SlackSetupForm = ({ onSubmit }: SlackSetupFormProps): JSX.Element => {
  const form = useMemo(() => getSlackForm(), []);

  return (
    <Form form={form} onSubmit={onSubmit}>
      {({ Form, FormField, FormFooter }: FormProps) => (
        <Form>
          <FormField name="token" />
          <FormField name="channel" />
          <FormFooter submitTitle={t`Save changes`} />
        </Form>
      )}
    </Form>
  );
};

export default SlackSetupForm;
