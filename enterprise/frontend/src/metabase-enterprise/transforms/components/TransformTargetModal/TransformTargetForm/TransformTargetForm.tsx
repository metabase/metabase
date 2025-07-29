import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useListDatabaseSchemasQuery } from "metabase/api";
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
import { Button, Flex, Stack } from "metabase/ui";
import type { DatabaseId, TransformTarget } from "metabase-types/api";

type TransformTargetFormProps = {
  databaseId: DatabaseId;
  target?: TransformTarget;
  onSubmit: (target: TransformTarget) => void;
  onCancel: () => void;
};

const NEW_TRANSFORM_SCHEMA = Yup.object().shape({
  type: Yup.string().oneOf(["view", "table"]),
  name: Yup.string().required(Errors.required),
  schema: Yup.string().required(Errors.required),
});

export function TransformTargetForm({
  databaseId,
  target,
  onSubmit,
  onCancel,
}: TransformTargetFormProps) {
  const {
    data: schemas = [],
    isLoading,
    error,
  } = useListDatabaseSchemasQuery({ id: databaseId, include_hidden: true });

  const initialValues: TransformTarget = useMemo(
    () =>
      target ?? { type: "view", name: "", schema: schemas ? schemas[0] : "" },
    [target, schemas],
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={NEW_TRANSFORM_SCHEMA}
      onSubmit={onSubmit}
    >
      <Form>
        <Stack>
          <FormTextInput name="name" label={t`Name`} />
          <FormTextInput
            name="targetName"
            label={t`What should it be called in the database?`}
          />
          <FormSelect
            name="targetSchema"
            label={t`In which schema should it go?`}
            data={schemas}
          />
          <FormErrorMessage />
          <Flex justify="end">
            {target ? (
              <Button variant="filled">{t`Save changes`}</Button>
            ) : (
              <FormSubmitButton label={t`Save`} variant="filled" />
            )}
            <Button onClick={onCancel}>{t`Cancel`}</Button>
          </Flex>
        </Stack>
      </Form>
    </FormProvider>
  );
}
