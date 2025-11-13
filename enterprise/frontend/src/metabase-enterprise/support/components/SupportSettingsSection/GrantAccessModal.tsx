import { useMount } from "react-use";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { PLUGIN_SUPPORT } from "metabase/plugins";
import { Box, Flex, Modal, Stack, Text } from "metabase/ui";
import { useCreateSupportAccessGrantMutation } from "metabase-enterprise/api";

interface GrantAccessModalProps {
  onClose: VoidFunction;
}

type AccessGrantFormValues = {
  grant_duration_minutes?: string;
  ticket_number?: string;
  notes?: string;
};

export const GrantAccessModal = ({ onClose }: GrantAccessModalProps) => {
  const [createSupportAccessGrant] = useCreateSupportAccessGrantMutation();
  const [sendToast] = useToast();

  useMount(() => {
    if (!PLUGIN_SUPPORT.isEnabled) {
      onClose();
    }
  });

  const handleSubmit = async (values: AccessGrantFormValues) => {
    if (!values.grant_duration_minutes) {
      sendToast({
        message: t`Please select a duration and provide a ticket number.`,
        icon: "warning",
      });
      return Promise.reject();
    }

    try {
      await createSupportAccessGrant({
        grant_duration_minutes: Number(values.grant_duration_minutes),
        notes: values.notes || null,
        ticket_number: values.ticket_number || null,
      }).unwrap();
      sendToast({
        message: t`Access grant created successfully`,
        icon: "check",
      });
      onClose();
    } catch (error) {
      sendToast({
        message: t`Sorry, something went wrong. Please try again.`,
        icon: "warning",
      });
      throw error;
    }
  };

  return (
    <Modal
      data-testid="grant-access-modal"
      onClose={onClose}
      opened
      title={t`Grant Access?`}
    >
      <Stack>
        <Box mt="sm">
          <Text display="inline">
            {/* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */}
            {t`You are about to allow a Metabase team member to access your instance.`}{" "}
          </Text>
          <Text fw="bold" display="inline">
            {t`The support agent will have full admin access until the grant expires or is revoked.`}
          </Text>
        </Box>
        <FormProvider initialValues={initialValues} onSubmit={handleSubmit}>
          {({ values }) => (
            <Form>
              <Stack>
                <FormSelect
                  name="grant_duration_minutes"
                  label={t`Access Duration`}
                  data={[
                    { value: String(24 * 60), label: t`24 hours` },
                    { value: String(48 * 60), label: t`48 hours` },
                    { value: String(96 * 60), label: t`96 hours` },
                  ]}
                  placeholder={t`Choose...`}
                  required
                />
                <FormTextInput
                  label={t`Ticket`}
                  name="ticket_number"
                  placeholder={t`TICKET-1234`}
                />
                <FormTextarea
                  label={t`Notes`}
                  name="notes"
                  placeholder={t`Add any important information we should know to help you better.`}
                />
                <Flex justify="end" mt="md" gap="md">
                  <FormErrorMessage />
                  <FormSubmitButton
                    disabled={!values.grant_duration_minutes}
                    label={t`Grant access`}
                    style={{ flexShrink: 0 }}
                    variant="filled"
                  />
                </Flex>
              </Stack>
            </Form>
          )}
        </FormProvider>
      </Stack>
    </Modal>
  );
};

const initialValues: AccessGrantFormValues = {
  grant_duration_minutes: String(96 * 60),
  ticket_number: "",
  notes: "",
};
