import React, { useCallback, useMemo } from "react";
import Form from "metabase/containers/Form";
import { SlackSettings } from "metabase-types/api";
import { getSlackForm } from "../../forms";
import { FormProps } from "./types";

export interface SlackStatusFormProps {
  settings: SlackSettings;
}

const SlackStatusForm = ({ settings }: SlackStatusFormProps): JSX.Element => {
  const form = useMemo(() => getSlackForm(true), []);
  const onSubmit = useCallback(() => undefined, []);

  return (
    <Form form={form} initialValues={settings} onSubmit={onSubmit}>
      {({ Form, FormField }: FormProps) => (
        <Form>
          <FormField name="slack-app-token" />
          <FormField name="slack-files-channel" />
        </Form>
      )}
    </Form>
  );
};

export default SlackStatusForm;
