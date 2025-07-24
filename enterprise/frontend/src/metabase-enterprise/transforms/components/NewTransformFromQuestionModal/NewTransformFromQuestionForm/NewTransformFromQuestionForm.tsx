import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import * as Yup from "yup";

import { useLazyGetCardQuery } from "metabase/api";
import { FormQuestionPicker } from "metabase/common/components/FormQuestionPicker";
import {
  Form,
  FormErrorMessage,
  FormProvider,
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
  card_id: CardId | null;
};

const NEW_TRANSFORM_SCHEMA = Yup.object().shape({
  name: Yup.string().required(Errors.required),
  schema: Yup.string().required(Errors.required),
  table: Yup.string().required(Errors.required),
  card_id: Yup.number().required(Errors.required),
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
      card_id: null,
    }),
    [],
  );

  const handleSubmit = async (settings: NewTransformSettings) => {
    if (settings.card_id === null) {
      return;
    }
    const card = await getCard({ id: settings.card_id }).unwrap();
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
            name="card_id"
            title={t`Question or model to copy the query definition from`}
            pickerModels={["card", "dataset"]}
          />
          <FormTextInput
            name="table"
            label={t`What should the generated table be called in the database?`}
          />
          <FormTextInput
            name="schema"
            label={t`The schema where this table should go`}
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
      schema: settings.schema,
      table: settings.table,
    },
  };
}
