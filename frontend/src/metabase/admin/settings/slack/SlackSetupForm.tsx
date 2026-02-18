import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";
import * as Yup from "yup";

import { useUpdateSlackSettingsMutation } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useSetting } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button, Flex, Stack } from "metabase/ui";

type FormValues = {
  "slack-app-token": string;
};

const SLACK_SCHEMA = Yup.object({
  "slack-app-token": Yup.string().ensure().required(Errors.required),
});

const DEFAULT_VALUES: FormValues = {
  "slack-app-token": "",
};

export const SlackSetupForm = ({
  initialValues = DEFAULT_VALUES,
}: {
  initialValues?: FormValues;
}) => {
  const isValid = useSetting("slack-token-valid?") ?? false;
  const [updateSlackSettings] = useUpdateSlackSettingsMutation();
  const handleSubmit = (values: FormValues) =>
    updateSlackSettings(SLACK_SCHEMA.cast(values) as FormValues).unwrap();

  const [isOpened, { open: handleOpen, close: handleClose }] =
    useDisclosure(false);

  // TODO: this should remove the new metabot slackbot settings too
  const handleDelete = () => {
    updateSlackSettings({ "slack-app-token": null });
    handleClose();
  };

  return (
    <>
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
              disabled={isValid}
            />
            <Flex justify="end" gap="sm">
              {isValid ? (
                <Button
                  onClick={handleOpen}
                  c="danger"
                >{t`Delete Slack App`}</Button>
              ) : (
                <FormSubmitButton label={t`Save changes`} />
              )}
            </Flex>
            <FormErrorMessage />
          </Stack>
        </Form>
      </FormProvider>
      <ConfirmModal
        opened={isOpened}
        onClose={handleClose}
        title={t`Are you sure you want to delete your Slack App?`}
        message={t`Doing this may stop your dashboard subscriptions from appearing in Slack until a new connection is set up. Are you sure you want to delete your Slack App integration?`}
        confirmButtonText={t`Delete`}
        onConfirm={handleDelete}
      />
    </>
  );
};
