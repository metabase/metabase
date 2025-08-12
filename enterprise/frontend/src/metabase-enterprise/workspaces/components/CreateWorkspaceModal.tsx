import { useCallback } from "react";
import { t } from "ttag";

import { Form, FormProvider } from "metabase/forms";
import { Button, Modal, Stack, TextInput, Textarea } from "metabase/ui";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type { CollectionId } from "metabase-types/api";

interface CreateWorkspaceModalProps {
  collectionId: CollectionId;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormValues {
  name: string;
  description?: string;
}

export function CreateWorkspaceModal({
  collectionId,
  opened,
  onClose,
  onSuccess,
}: CreateWorkspaceModalProps) {
  const [createWorkspace, { isLoading }] = useCreateWorkspaceMutation();

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      try {
        await createWorkspace({
          name: values.name,
          description: values.description,
          collection_id: collectionId,
        }).unwrap();
        onSuccess?.();
        onClose();
      } catch (error) {
        console.error("Failed to create workspace:", error);
      }
    },
    [createWorkspace, collectionId, onSuccess, onClose],
  );

  return (
    <Modal
      title={t`Create Workspace`}
      opened={opened}
      onClose={onClose}
      size="md"
    >
      <FormProvider
        initialValues={{ name: "", description: "" }}
        onSubmit={handleSubmit}
      >
        {({ values, setFieldValue }) => (
          <Form>
            <Stack gap="md">
              <TextInput
                label={t`Name`}
                placeholder={t`Enter workspace name`}
                value={values.name}
                onChange={(e) => setFieldValue("name", e.target.value)}
                required
                data-testid="workspace-name-input"
              />
              <Textarea
                label={t`Description`}
                placeholder={t`Enter workspace description (optional)`}
                value={values.description}
                onChange={(e) => setFieldValue("description", e.target.value)}
                minRows={3}
                data-testid="workspace-description-input"
              />
              <Stack gap="sm" align="flex-end">
                <Button.Group>
                  <Button variant="outline" onClick={onClose}>
                    {t`Cancel`}
                  </Button>
                  <Button
                    type="submit"
                    variant="filled"
                    loading={isLoading}
                    disabled={!values.name.trim()}
                  >
                    {t`Create`}
                  </Button>
                </Button.Group>
              </Stack>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
}