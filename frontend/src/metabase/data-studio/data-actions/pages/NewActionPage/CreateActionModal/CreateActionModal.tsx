import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useCreateActionMutation } from "metabase/api";
import FormCollectionPicker from "metabase/common/collections/containers/FormCollectionPicker";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Alert, Box, Button, Group, Icon, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type { WritebackAction } from "metabase-types/api";

import { ACTION_NAME_MAX_LENGTH } from "../../../constants";
import type { ActionDefinition } from "../../../utils";

const getValidationSchema = () =>
  Yup.object({
    name: Yup.string()
      .required(Errors.required)
      .max(ACTION_NAME_MAX_LENGTH, Errors.maxLength),
    description: Yup.string().nullable().defined(),
    collection_id: Yup.number().nullable().defined(),
  });

type NewActionValues = Yup.InferType<ReturnType<typeof getValidationSchema>>;

type CreateActionModalProps = {
  definition: ActionDefinition;
  defaultName: string;
  onCreate: (action: WritebackAction) => void;
  onClose: () => void;
};

export function CreateActionModal({
  definition,
  defaultName,
  onCreate,
  onClose,
}: CreateActionModalProps) {
  const [createAction] = useCreateActionMutation();
  const validationSchema = useMemo(getValidationSchema, []);
  const initialValues: NewActionValues = {
    name: defaultName,
    description: null,
    collection_id: null,
  };

  const handleSubmit = async ({
    name,
    description,
    collection_id,
  }: NewActionValues) => {
    const action = await createAction({
      ...definition,
      type: "query",
      name,
      description: description || null,
      collection_id,
    }).unwrap();
    onCreate(action);
  };

  return (
    <Modal title={t`Save your action`} opened padding="xxl" onClose={onClose}>
      <FormProvider
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="xl" mt="sm">
            <FormTextInput name="name" label={t`Name`} data-autofocus />
            <FormTextarea
              name="description"
              label={t`Description`}
              placeholder={t`What does this action change?`}
              nullable
            />
            <FormCollectionPicker
              name="collection_id"
              title={t`Collection`}
              style={{ marginBottom: 0 }}
            />
            <Alert variant="light" icon={<Icon name="info" />}>
              {t`Anyone who can view this collection can run this action.`}
            </Alert>
            <Group>
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <Button onClick={onClose}>{t`Back`}</Button>
              <FormSubmitButton label={t`Save`} variant="filled" />
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
