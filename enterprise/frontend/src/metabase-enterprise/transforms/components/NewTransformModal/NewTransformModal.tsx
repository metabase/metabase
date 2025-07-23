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
import type { NewTransformModalProps } from "metabase/plugins";
import { Flex, Modal, Stack } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import * as Lib from "metabase-lib";
import type { CreateTransformRequest } from "metabase-types/api";

export function NewTransformModal({
  question,
  opened,
  onClose,
}: NewTransformModalProps) {
  return (
    <Modal.Root padding="2.5rem" opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{t`New transform`}</Modal.Title>
          <Flex align="center" justify="flex-end" gap="sm">
            <Modal.CloseButton />
          </Flex>
        </Modal.Header>
        <Modal.Body>
          <NewTransformForm query={question.query()} onClose={onClose} />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

type NewTransformFormProps = {
  query: Lib.Query;
  onClose: () => void;
};

type NewTransformSettings = {
  name: string;
  schema: string;
  table: string;
};

const NEW_TRANSFORM_SCHEMA = Yup.object().shape({
  name: Yup.string().required(Errors.required).default(""),
  schema: Yup.string().required(Errors.required).default(""),
  table: Yup.string().required(Errors.required).default(""),
});

function NewTransformForm({ query, onClose }: NewTransformFormProps) {
  const [createTransform] = useCreateTransformMutation();

  const handleSubmit = async (settings: NewTransformSettings) => {
    await createTransform(getRequest(query, settings)).unwrap();
    onClose();
  };

  return (
    <FormProvider
      initialValues={NEW_TRANSFORM_SCHEMA.getDefault()}
      validationSchema={NEW_TRANSFORM_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack>
          <FormTextInput name="name" label={t`Name`} />
          <FormTextInput name="schema" label={t`Schema`} />
          <FormTextInput name="table" label={t`Table`} />
          <FormErrorMessage />
          <Flex justify="end">
            <FormSubmitButton variant="filled" />
          </Flex>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getRequest(
  query: Lib.Query,
  settings: NewTransformSettings,
): CreateTransformRequest {
  return {
    name: settings.name,
    source: {
      type: "query",
      query: Lib.toLegacyQuery(query),
    },
    target: {
      type: "table",
      schema: settings.schema,
      table: settings.table,
    },
  };
}
