import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useUpdateTransformTagMutation } from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, FocusTrap, Modal } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type { TransformTag } from "metabase-types/api";

type UpdateTagModalProps = {
  tag: TransformTag;
  onUpdate: (tag: TransformTag) => void;
  onClose: () => void;
};

export function UpdateTagModal({
  tag,
  onUpdate,
  onClose,
}: UpdateTagModalProps) {
  return (
    <Modal title={t`Rename the ${tag.name} tag`} opened onClose={onClose}>
      <FocusTrap.InitialFocus />
      <UpdateTagForm tag={tag} onUpdate={onUpdate} onClose={onClose} />
    </Modal>
  );
}

type UpdateTagFormProps = {
  tag: TransformTag;
  onUpdate: (tag: TransformTag) => void;
  onClose: () => void;
};

type UpdateTagValues = {
  name: string;
};

const UPDATE_TAG_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
});

function UpdateTagForm({ tag, onUpdate, onClose }: UpdateTagFormProps) {
  const [updateTag] = useUpdateTransformTagMutation();

  const initialValues: UpdateTagValues = useMemo(
    () => ({ name: tag.name }),
    [tag.name],
  );

  const handleSubmit = async ({ name }: UpdateTagValues) => {
    const updatedTag = await updateTag({ id: tag.id, name }).unwrap();
    onUpdate(updatedTag);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={UPDATE_TAG_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ dirty }) => (
        <Form>
          <FormTextInput name="name" label={t`Name`} placeholder={t`My tag`} />
          <Modal.Footer>
            <FormErrorMessage flex={1} />
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              label={t`Save`}
              variant="filled"
              disabled={!dirty}
            />
          </Modal.Footer>
        </Form>
      )}
    </FormProvider>
  );
}
