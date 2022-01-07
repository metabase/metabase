import React from "react";
import Form from "metabase/containers/Form";
import { getSlackForm } from "../../forms";
import { FormProps } from "./types";

const SlackStatusForm = (): JSX.Element => {
  const form = getSlackForm(true);
  const onSubmit = () => undefined;

  return (
    <Form form={form} onSubmit={onSubmit}>
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
