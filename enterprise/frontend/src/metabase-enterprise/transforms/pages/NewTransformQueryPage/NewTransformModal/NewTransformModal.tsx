import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormRadioGroup,
  FormSegmentedControl,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { getScheduleExplanation } from "metabase/lib/cron";
import * as Errors from "metabase/lib/errors";
import { Button, Group, Modal, Radio, Stack } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import type {
  CreateTransformRequest,
  DatasetQuery,
  Transform,
  TransformExecutionTrigger,
  TransformTargetType,
} from "metabase-types/api";

type NewTransformModalProps = {
  query: DatasetQuery;
  onSave: (transform: Transform) => void;
  onCancel: () => void;
};

export function NewTransformModal({
  query,
  onSave,
  onCancel,
}: NewTransformModalProps) {
  return (
    <Modal title={t`New transform`} opened padding="xl" onClose={onCancel}>
      <NewTransformForm query={query} onSave={onSave} onCancel={onCancel} />
    </Modal>
  );
}

type NewTransformFormProps = {
  query: DatasetQuery;
  onSave: (transform: Transform) => void;
  onCancel: () => void;
};

type NewTransformValues = {
  type: TransformTargetType;
  name: string;
  schema: string | null;
  executionTrigger: TransformExecutionTrigger;
};

const NEW_TRANSFORM_SCHEMA = Yup.object({
  type: Yup.string().oneOf(["view", "table"]),
  name: Yup.string().required(Errors.required),
  schema: Yup.string().nullable(),
  executionTrigger: Yup.string().oneOf(["none", "global-schedule"]),
});

function NewTransformForm({ query, onSave, onCancel }: NewTransformFormProps) {
  const { database: databaseId } = query;
  const {
    data: schemas = [],
    isLoading,
    error,
  } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: true } : skipToken,
  );
  const schedule = useSetting("transform-schedule");
  const [createTransform] = useCreateTransformMutation();

  const initialValues: NewTransformValues = useMemo(
    () => getInitialValues(schemas),
    [schemas],
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const handleSubmit = async (values: NewTransformValues) => {
    const request = getCreateRequest(query, values);
    const transform = await createTransform(request).unwrap();
    onSave(transform);
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={NEW_TRANSFORM_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <FormSegmentedControl
            name="type"
            label={t`Should this transform create a view or a table in the database?`}
            data={getTypeOptions()}
          />
          <FormTextInput
            name="name"
            label={t`What should it be called in the database?`}
          />
          {schemas.length > 0 && (
            <FormSelect
              name="schema"
              label={t`In which schema should it go?`}
              data={schemas}
            />
          )}
          <FormRadioGroup
            name="executionTrigger"
            label={t`When should this transform run?`}
            description={getScheduleDescription(schedule)}
          >
            <Stack gap="sm">
              <Radio value="global-schedule" label={t`On the schedule`} />
              <Radio value="none" label={t`Manually only`} />
            </Stack>
          </FormRadioGroup>
          <FormErrorMessage />
          <Group justify="end">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

function getInitialValues(schemas: string[]): NewTransformValues {
  return {
    type: "view",
    name: "",
    schema: schemas ? schemas[0] : null,
    executionTrigger: "global-schedule",
  };
}

function getTypeOptions() {
  return [
    { value: "view", label: t`View` },
    { value: "table", label: t`Table` },
  ];
}

function getCreateRequest(
  query: DatasetQuery,
  { type, name, schema, executionTrigger }: NewTransformValues,
): CreateTransformRequest {
  return {
    name: name,
    source: {
      type: "query",
      query,
    },
    target: {
      type: type,
      name: name,
      schema: schema,
    },
    execution_trigger: executionTrigger,
  };
}

function getScheduleDescription(schedule: string | undefined) {
  if (!schedule) {
    return null;
  }

  const explanation = getScheduleExplanation(schedule) ?? schedule;
  return t`The schedule is currently ${explanation}. You can change this on the overview page.`;
}
