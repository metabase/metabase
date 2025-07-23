import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { useDispatch } from "metabase/lib/redux";
import type { NewTransformModalProps } from "metabase/plugins";
import { Flex, Modal, Stack } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import * as Lib from "metabase-lib";
import type { CreateTransformRequest, Transform } from "metabase-types/api";

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
          <NewTransformForm query={question.query()} />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

type NewTransformFormProps = {
  query: Lib.Query;
};

type NewTransformSettings = {
  name: string;
  schema: string;
  table: string;
};

const NEW_TRANSFORM_SCHEMA = Yup.object().shape({
  name: Yup.string().required(Errors.required),
  schema: Yup.string().required(Errors.required),
  table: Yup.string().required(Errors.required),
});

function NewTransformForm({ query }: NewTransformFormProps) {
  const databaseId = Lib.databaseID(query);
  const {
    data: schemas = [],
    isLoading,
    error,
  } = useListDatabaseSchemasQuery(databaseId ? { id: databaseId } : skipToken);
  const [createTransform] = useCreateTransformMutation();
  const dispatch = useDispatch();

  const initialValues = useMemo(
    () => ({ name: "", schema: schemas ? schemas[0] : "", table: "" }),
    [schemas],
  );

  const handleSubmit = async (settings: NewTransformSettings) => {
    const request = getRequest(query, settings);
    const transform = await createTransform(request).unwrap();
    dispatch(push(getTransformUrl(transform)));
  };

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={NEW_TRANSFORM_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack>
          <FormTextInput name="name" label={t`Name`} />
          <FormTextInput
            name="table"
            label={t`What should the generated table be called in the database?`}
          />
          <FormSelect
            name="schema"
            label={t`The schema where this table should go`}
            data={schemas}
          />
          <FormErrorMessage />
          <Flex justify="end">
            <FormSubmitButton label={t`Save`} variant="filled" />
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

function getTransformUrl(transform: Transform) {
  return `/admin/datamodel/database/${transform.source.query.database}/transform/${transform.id}`;
}
