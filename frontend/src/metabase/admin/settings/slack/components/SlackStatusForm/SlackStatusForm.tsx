import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Form from "metabase/containers/FormikForm";
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
    <Form<SlackSettings>
      form={form}
      initialValues={settings}
      onSubmit={onSubmit}
    >
      {({ Form, FormField }: FormProps) => (
        <Form>
          <FormField name="slack-app-token" />
          <FormField
            name="slack-files-channel"
            description={t`This channel shouldn't really be used by anyone — we'll upload charts and tables here before sending out dashboard subscriptions (it's a Slack requirement).`}
          />
        </Form>
      )}
    </Form>
  );
};

export default SlackStatusForm;
