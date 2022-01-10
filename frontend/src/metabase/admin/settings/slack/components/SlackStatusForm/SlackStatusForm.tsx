import React from "react";
import Form from "metabase/containers/Form";
import { SlackSettings } from "metabase-types/api";
import { getSlackForm } from "../../forms";
import { FormProps } from "./types";

export interface SlackStatusFormProps {
  settings?: SlackSettings;
}

const SlackStatusForm = ({ settings }: SlackStatusFormProps): JSX.Element => {
  const form = getSlackForm(true);
  const onSubmit = () => undefined;

  return (
    <Form form={form} initialValues={settings} onSubmit={onSubmit}>
      {({ Form, FormField }: FormProps) => (
        <Form>
          <FormField name="token" />
          <FormField name="channel" />
        </Form>
      )}
    </Form>
  );
};

export default SlackStatusForm;
