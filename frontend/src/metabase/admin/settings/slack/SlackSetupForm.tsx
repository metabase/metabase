import { t } from "ttag";
import * as Yup from "yup";

import { useUpdateSlackSettingsMutation } from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Flex, Stack } from "metabase/ui";
import type { SlackSettings } from "metabase-types/api";

const SLACK_SCHEMA = Yup.object({
  "slack-app-token": Yup.string().ensure().required(Errors.required),
  "slack-bug-report-channel": Yup.string()
    .nullable()
    .default(null)
    .transform((value, originalValue) => (originalValue === "" ? null : value))
    .lowercase(),
});

const DEFAULT_SETTINGS: SlackSettings = {
  "slack-app-token": "",
  "slack-bug-report-channel": "",
};

export const SlackSetupForm = ({
  initialValues = DEFAULT_SETTINGS,
}: {
  initialValues?: SlackSettings;
}) => {
  const { value: isBugReportingEnabled } = useAdminSetting(
    "bug-reporting-enabled",
  );
  const [updateSlackSettings] = useUpdateSlackSettingsMutation();
  const handleSubmit = (values: SlackSettings) =>
    updateSlackSettings(SLACK_SCHEMA.cast(values) as SlackSettings).unwrap();

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={SLACK_SCHEMA}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      <Form>
        <Stack>
          <FormTextInput
            name="slack-app-token"
            label={t`Slack bot user OAuth token`}
            placeholder="xoxb-123..."
          />
          {isBugReportingEnabled && (
            <FormTextInput
              name="slack-bug-report-channel"
              label={t`Public channel for bug reports`}
              description={t`This channel will receive bug reports submitted by users.`}
              placeholder="metabase-bugs"
            />
          )}
          <Flex justify="end">
            <FormSubmitButton label={t`Save changes`} />
          </Flex>
          <FormErrorMessage />
        </Stack>
      </Form>
    </FormProvider>
  );
};
