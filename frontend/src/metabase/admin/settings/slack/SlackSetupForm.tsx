import { t } from "ttag";
import * as Yup from "yup";

import { useUpdateSlackSettingsMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Flex, Stack } from "metabase/ui";

type FormValues = { "slack-app-token": string };

const SLACK_SCHEMA = Yup.object({
  "slack-app-token": Yup.string().ensure().required(Errors.required),
});

export const SlackSetupForm = ({
  initialValues = { "slack-app-token": "" },
}: {
  initialValues?: FormValues;
}) => {
  const [updateSlackSettings] = useUpdateSlackSettingsMutation();
  const handleSubmit = (values: FormValues) =>
    updateSlackSettings(SLACK_SCHEMA.cast(values) as FormValues).unwrap();

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={SLACK_SCHEMA}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      <Form>
        <Stack gap="sm">
          <FormTextInput
            name="slack-app-token"
            label={t`Slack bot user OAuth token`}
            placeholder="xoxb-123..."
            style={{ flex: 1 }}
          />
          <Flex direction="row-reverse" justify="space-between">
            <FormSubmitButton label={t`Connect`} />
            <FormErrorMessage />
          </Flex>
        </Stack>
      </Form>
    </FormProvider>
  );
};
