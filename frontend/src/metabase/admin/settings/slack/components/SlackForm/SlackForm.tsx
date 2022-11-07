import React from "react";
import { t } from "ttag";
import * as Yup from "yup";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { SlackSettings } from "metabase-types/api";
import { SlackFormMessage } from "./SlackForm.styled";

const SlackSchema = Yup.object({
  "slack-app-token": Yup.string().required(t`required`),
  "slack-files-channel": Yup.string().required(t`required`),
});

export interface SlackFormProps {
  initialValues: SlackSettings;
  isReadOnly?: boolean;
  onSubmit?: (values: SlackSettings) => void;
}

const SlackForm = ({
  initialValues,
  isReadOnly,
  onSubmit = () => undefined,
}: SlackFormProps): JSX.Element => {
  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={!isReadOnly ? SlackSchema : undefined}
      onSubmit={onSubmit}
    >
      <Form>
        <FormInput
          name="slack-app-token"
          title={t`Slack Bot User OAuth Token`}
          placeholder="xoxb-781236542736-2364535789652-GkwFDQoHqzXDVsC6GzqYUypD"
          readOnly={isReadOnly}
        />
        {!isReadOnly && (
          <SlackFormMessage>
            {SLACK_CHANNEL_PROMPT} {SLACK_CHANNEL_DESCRIPTION}
          </SlackFormMessage>
        )}
        <FormInput
          name="slack-files-channel"
          title={t`Public channel to store image files`}
          description={isReadOnly ? SLACK_CHANNEL_DESCRIPTION : undefined}
          placeholder="metabase_files"
          readOnly={isReadOnly}
        />
        {!isReadOnly && (
          <>
            <FormSubmitButton title={t`Save changes`} />
            <FormErrorMessage />
          </>
        )}
      </Form>
    </FormProvider>
  );
};

const SLACK_CHANNEL_PROMPT = t`Finally, open Slack, create a public channel and enter its name below.`;
const SLACK_CHANNEL_DESCRIPTION = t`This channel shouldn't really be used by anyone — we'll upload charts and tables here before sending out dashboard subscriptions (it's a Slack requirement).`;

export default SlackForm;
