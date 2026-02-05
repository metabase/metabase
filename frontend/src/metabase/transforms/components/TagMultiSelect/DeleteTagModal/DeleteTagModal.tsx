import { t } from "ttag";

import { useDeleteTransformTagMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Box, Button, FocusTrap, Group, Modal, Stack, Text } from "metabase/ui";
import type { TransformTag } from "metabase-types/api";

type DeleteTagModalProps = {
  tag: TransformTag;
  onDelete: () => void;
  onClose: () => void;
};

export function DeleteTagModal({
  tag,
  onDelete,
  onClose,
}: DeleteTagModalProps) {
  return (
    <Modal
      title={t`Delete the ${tag.name} tag?`}
      opened
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <DeleteTagForm tag={tag} onDelete={onDelete} onClose={onClose} />
    </Modal>
  );
}

type DeleteTagFormProps = {
  tag: TransformTag;
  onDelete: () => void;
  onClose: () => void;
};

function DeleteTagForm({ tag, onDelete, onClose }: DeleteTagFormProps) {
  const [deleteTag] = useDeleteTransformTagMutation();

  const handleSubmit = async () => {
    await deleteTag(tag.id).unwrap();
    onDelete();
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack gap="lg">
          <Text>{t`The tag will be deleted from transforms and jobs that use it.`}</Text>
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Delete tag`}
              variant="filled"
              color="error"
            />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
