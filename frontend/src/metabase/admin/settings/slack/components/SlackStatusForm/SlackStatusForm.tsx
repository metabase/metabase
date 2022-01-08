import React from "react";
import Form from "metabase/containers/Form";
import { getSlackForm } from "../../forms";
import { FormProps } from "./types";

export interface SlackStatusFormProps {
  token?: string;
  channel?: string;
}

const SlackStatusForm = ({
  token,
  channel,
}: SlackStatusFormProps): JSX.Element => {
  const form = getSlackForm(true);
  const values = { token, channel };
  const onSubmit = () => undefined;

  return (
    <Form form={form} initialValues={values} onSubmit={onSubmit}>
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
