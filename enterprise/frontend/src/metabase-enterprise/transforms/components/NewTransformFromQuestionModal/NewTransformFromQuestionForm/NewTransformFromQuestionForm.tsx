import { useFormikContext } from "formik";
import { useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import {
  skipToken,
  useGetCardQuery,
  useLazyGetCardQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { FormQuestionPicker } from "metabase/common/components/FormQuestionPicker";
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
import type {
  CardId,
  CreateTransformRequest,
  DatasetQuery,
} from "metabase-types/api";

import { transformUrl } from "../../../utils/urls";

type NewTransformSettings = {
  name: string;
  schema: string;
  table: string;
  cardId: CardId | null;
};

const NEW_TRANSFORM_SCHEMA = Yup.object().shape({
  name: Yup.string().required(Errors.required),
  schema: Yup.string().required(Errors.required),
  table: Yup.string().required(Errors.required),
  cardId: Yup.number().required(Errors.required),
});

export function NewTransformFromQuestionForm() {
  const [getCard] = useLazyGetCardQuery();
  const [createTransform] = useCreateTransformMutation();
  const dispatch = useDispatch();

  const initialValues = useMemo(
    () => ({
      name: "",
      schema: "",
      table: "",
      cardId: null,
    }),
    [],
  );

  const handleSubmit = async (settings: NewTransformSettings) => {
    if (settings.cardId === null) {
      return;
    }
    const card = await getCard({ id: settings.cardId }).unwrap();
    const request = getRequest(card.dataset_query, settings);
    const transform = await createTransform(request).unwrap();
    dispatch(push(transformUrl(transform.id)));
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={NEW_TRANSFORM_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack>
          <FormTextInput name="name" label={t`Name`} />
          <FormQuestionPicker
            name="cardId"
            title={t`Question or model to copy the query definition from`}
            pickerModels={["card", "dataset"]}
          />
          <FormTextInput
            name="table"
            label={t`What should the generated table be called in the database?`}
          />
          <SchemaSelect />
          <FormErrorMessage />
          <Flex justify="end">
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Flex>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function SchemaSelect() {
  const { values, setFieldValue } = useFormikContext<NewTransformSettings>();
  const { cardId } = values;
  const { data: card } = useGetCardQuery(
    cardId != null ? { id: cardId } : skipToken,
  );
  const databaseId = card?.dataset_query?.database;
  const { data: schemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  useEffect(() => {
    if (schemas.length > 0) {
      setFieldValue("schema", schemas[0]);
    }
  }, [schemas, setFieldValue]);

  return (
    <FormSelect
      name="schema"
      label={t`The schema where this table should go`}
      data={schemas}
    />
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
      schema: settings.schema,
      table: settings.table,
    },
  };
}
