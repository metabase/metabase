import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button, FocusTrap, Group, Modal, Stack } from "metabase/ui";
import { useCreateTransformTagMutation } from "metabase-enterprise/api";
import type { TransformTag } from "metabase-types/api";

type CreateTagModalProps = {
  initialName: string;
  onCreate: (tag: TransformTag) => void;
  onClose: () => void;
};

export function CreateTagModal({
  initialName,
  onCreate,
  onClose,
}: CreateTagModalProps) {
  return (
    <Modal title={t`Create a new tag`} opened padding="xl" onClose={onClose}>
      <FocusTrap.InitialFocus />
      <CreateTagForm
        initialName={initialName}
        onCreate={onCreate}
        onClose={onClose}
      />
    </Modal>
  );
}

type CreateTagFormProps = {
  initialName: string;
  onCreate: (tag: TransformTag) => void;
  onClose: () => void;
};

type NewTagValues = {
  name: string;
};

const NEW_TRANSFORM_SCHEMA = Yup.object({
  name: Yup.string().required(Errors.required),
});

function CreateTagForm({ initialName, onCreate, onClose }: CreateTagFormProps) {
  const [createTag] = useCreateTransformTagMutation();

  const initialValues: NewTagValues = useMemo(
    () => ({ name: initialName }),
    [initialName],
  );

  const handleSubmit = async ({ name }: NewTagValues) => {
    const tag = await createTag({ name }).unwrap();
    onCreate(tag);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={NEW_TRANSFORM_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormTextInput name="name" label={t`Name`} placeholder={t`My tag`} />
          <FormErrorMessage />
          <Group justify="end">
            <Button variant="subtle" onClick={onClose}>{t`Back`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
