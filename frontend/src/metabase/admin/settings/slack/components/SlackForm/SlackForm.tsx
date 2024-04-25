import { useCallback } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { Form, FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import type { SlackSettings } from "metabase-types/api";

import { SlackFormMessage } from "./SlackForm.styled";

const SLACK_SCHEMA = Yup.object({
  "slack-app-token": Yup.string().ensure().required(Errors.required),
  "slack-files-channel": Yup.string()
    .ensure()
    .required(Errors.required)
    .lowercase(),
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
  const handleSubmit = useCallback(
    (values: SlackSettings) => onSubmit(SLACK_SCHEMA.cast(values)),
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={!isReadOnly ? SLACK_SCHEMA : undefined}
      onSubmit={handleSubmit}
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
            <FormSubmitButton title={t`Save changes`} primary />
            <FormErrorMessage />
          </>
        )}
      </Form>
    </FormProvider>
  );
};

const SLACK_CHANNEL_PROMPT = t`Finally, open Slack, create a public channel and enter its name below.`;
const SLACK_CHANNEL_DESCRIPTION = t`This channel shouldn't really be used by anyone — we'll upload charts and tables here before sending out dashboard subscriptions (it's a Slack requirement).`;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackForm;
