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
import { Flex, Stack } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import { getTransformUrl } from "metabase-enterprise/transforms/utils/urls";
import type { CreateTransformRequest, DatasetQuery } from "metabase-types/api";

type NewTransformFormProps = {
  query: DatasetQuery;
};

type NewTransformSettings = {
  name: string;
  targetName: string;
  targetSchema: string;
};

const NEW_TRANSFORM_SCHEMA = Yup.object().shape({
  name: Yup.string().required(Errors.required),
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().required(Errors.required),
});

export function NewTransformForm({ query }: NewTransformFormProps) {
  const databaseId = query.database;
  const {
    data: schemas = [],
    isLoading,
    error,
  } = useListDatabaseSchemasQuery(databaseId ? { id: databaseId } : skipToken);
  const [createTransform] = useCreateTransformMutation();
  const dispatch = useDispatch();

  const initialValues = useMemo(
    () => ({
      name: "",
      targetName: "",
      targetSchema: schemas ? schemas[0] : "",
    }),
    [schemas],
  );

  const handleSubmit = async (settings: NewTransformSettings) => {
    const request = getRequest(query, settings);
    const transform = await createTransform(request).unwrap();
    dispatch(push(getTransformUrl(transform.id)));
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
            name="targetName"
            label={t`What should the generated table be called in the database?`}
          />
          <FormSelect
            name="targetSchema"
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
  query: DatasetQuery,
  settings: NewTransformSettings,
): CreateTransformRequest {
  return {
    name: settings.name,
    source: {
      type: "query",
      query,
    },
    target: {
      type: "table",
      name: settings.targetName,
      schema: settings.targetSchema,
    },
  };
}
