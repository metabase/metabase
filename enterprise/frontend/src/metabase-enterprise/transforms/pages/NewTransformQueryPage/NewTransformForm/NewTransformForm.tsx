import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
import * as Errors from "metabase/lib/errors";
import { Button, Group, Radio, Stack } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import type {
  CreateTransformRequest,
  DatasetQuery,
  Transform,
  TransformExecutionTrigger,
  TransformTargetType,
} from "metabase-types/api";

type NewTransformFormProps = {
  query: DatasetQuery;
  onSave: (transform: Transform) => void;
  onCancel: () => void;
};

type NewTransformValues = {
  targetType: TransformTargetType;
  targetName: string;
  targetSchema: string | null;
  executionTrigger: TransformExecutionTrigger;
};

const NEW_TRANSFORM_SCHEMA = Yup.object({
  targetType: Yup.string().oneOf(["view", "table"]),
  targetName: Yup.string().required(Errors.required),
  targetSchema: Yup.string().nullable(),
  executionTrigger: Yup.string().oneOf(["none", "global-schedule"]),
});

export function NewTransformForm({
  query,
  onSave,
  onCancel,
}: NewTransformFormProps) {
  const { database: databaseId } = query;
  const {
    data: schemas = [],
    isLoading,
    error,
  } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: true } : skipToken,
  );
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
            name="targetType"
            label={t`Should this transform create a view or a table in the database?`}
            data={getTypeOptions()}
          />
          <FormTextInput
            name="targetName"
            label={t`What should it be called in the database?`}
          />
          {schemas.length > 0 && (
            <FormSelect
              name="targetSchema"
              label={t`In which schema should it go?`}
              data={schemas}
            />
          )}
          <FormRadioGroup
            name="executionTrigger"
            label={t`When should this transform run?`}
            description={t`The schedule is currently daily at 12:00 AM UTC. You can change this on the overview page.`}
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
    targetType: "view",
    targetName: "",
    targetSchema: schemas ? schemas[0] : null,
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
  {
    targetType,
    targetName,
    targetSchema,
    executionTrigger,
  }: NewTransformValues,
): CreateTransformRequest {
  return {
    name: targetName,
    source: {
      type: "query",
      query,
    },
    target: {
      type: targetType,
      name: targetName,
      schema: targetSchema,
    },
    execution_trigger: executionTrigger,
  };
}
