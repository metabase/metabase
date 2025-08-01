import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSegmentedControl,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Button, Group, Stack } from "metabase/ui";
import type { DatabaseId, TransformTarget } from "metabase-types/api";

type TransformTargetFormProps = {
  databaseId: DatabaseId;
  target?: TransformTarget;
  onSubmit: (target: TransformTarget) => void;
  onCancel: () => void;
};

const TYPE_OPTIONS = [
  {
    value: "view",
    get label() {
      return t`View`;
    },
  },
  {
    value: "table",
    get label() {
      return t`Table`;
    },
  },
];

const TARGET_SCHEMA = Yup.object().shape({
  type: Yup.string().oneOf(["view", "table"]),
  name: Yup.string().required(Errors.required),
  schema: Yup.string().nullable(),
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
      target ?? { type: "view", name: "", schema: schemas ? schemas[0] : null },
    [target, schemas],
  );

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={TARGET_SCHEMA}
      onSubmit={onSubmit}
    >
      {({ values }) => (
        <Form>
          <Stack>
            <FormSegmentedControl
              name="type"
              label={t`Should this transform create a view or a table in the database?`}
              data={TYPE_OPTIONS}
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
            <FormErrorMessage />
            <Group justify="end">
              <Button onClick={onCancel}>{t`Cancel`}</Button>
              {target ? (
                <Button variant="filled" onClick={() => onSubmit(values)}>
                  {t`Save changes`}
                </Button>
              ) : (
                <FormSubmitButton label={t`Save`} variant="filled" />
              )}
            </Group>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}
