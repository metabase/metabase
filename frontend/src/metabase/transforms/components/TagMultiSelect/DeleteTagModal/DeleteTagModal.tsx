import { t } from "ttag";

import { useDeleteTransformTagMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, FocusTrap, Modal, Text } from "metabase/ui";
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
    <Modal title={t`Delete the ${tag.name} tag?`} opened onClose={onClose}>
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
        <Text>{t`The tag will be deleted from transforms and jobs that use it.`}</Text>
        <Modal.Footer>
          <FormErrorMessage flex={1} />
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <FormSubmitButton
            label={t`Delete tag`}
            variant="filled"
            color="negative"
          />
        </Modal.Footer>
      </Form>
    </FormProvider>
  );
}
