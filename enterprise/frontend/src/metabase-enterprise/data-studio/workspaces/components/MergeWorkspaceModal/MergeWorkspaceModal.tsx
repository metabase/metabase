import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextarea,
} from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Flex, Modal, Stack, Text } from "metabase/ui";
const MAX_COMMIT_MESSAGE_LENGTH = 255;
type MergeWorkspaceModalProps = {
  onClose: VoidFunction;
  onSubmit: (commitMessage: string) => Promise<void>;
  isLoading?: boolean;
}

type MergeWorkspaceFormValues = {
  commit_message: string;
};

const getMergeWorkspaceSchema = () =>
  Yup.object().shape({
    commit_message: Yup.string()
      .trim()
      .max(MAX_COMMIT_MESSAGE_LENGTH, t`Commit message is too long.`)
      .required(t`Please provide a commit message.`),
  });

export const MergeWorkspaceModal = ({
  onClose,
  onSubmit,
  isLoading = false,
}: MergeWorkspaceModalProps) => {
  const { sendErrorToast } = useMetadataToasts();
  const validationSchema = useMemo(() => getMergeWorkspaceSchema(), []);

  const handleSubmit = async (values: MergeWorkspaceFormValues) => {
    try {
      await onSubmit(values.commit_message.trim());
      onClose();
    } catch (error) {
      sendErrorToast(t`Failed to merge workspace`);
      throw error;
    }
  };

  return (
    <Modal
      data-testid="merge-workspace-modal"
      onClose={onClose}
      opened
      title={t`Merge workspace?`}
      padding="xl"
    >
      <Stack>
        <Box mt="sm">
          <Text>{t`This will merge all changes from this workspace back to the source transforms.`}</Text>
          <Text mt="xs">
            {t`The commit message will be used to display the history of transform changes.`}
          </Text>
        </Box>
        <FormProvider
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ values, touched, errors }) => (
            <Form>
              <Stack mt="md">
                <Stack gap="sm">

                <FormTextarea
                  data-autofocus
                  label={t`Commit message`}
                  name="commit_message"
                  placeholder={t`Describe the changes you made in this workspace...`}
                  minRows={4}
                  required
                />
                {!errors.commit_message && <Text size="xs" c="text-tertiary" ta="right" >
                  {(values.commit_message?.length ?? 0)}/{MAX_COMMIT_MESSAGE_LENGTH}
                </Text>}
                </Stack>
                <Flex justify="end" mt="md" gap="sm">
                  <FormSubmitButton
                    disabled={!values.commit_message?.trim() || (touched.commit_message && !!errors.commit_message)}
                    label={t`Merge`}
                    loading={isLoading}
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

const initialValues: MergeWorkspaceFormValues = {
  commit_message: "",
};
