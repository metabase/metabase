import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormCheckbox,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import {
  Alert,
  Box,
  Button,
  FocusTrap,
  Group,
  Modal,
  Stack,
} from "metabase/ui";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

type UpdateIncrementalModalProps = {
  transform: Transform;
  onUpdate: () => void;
  onClose: () => void;
};

export function UpdateIncrementalModal({
  transform,
  onUpdate,
  onClose,
}: UpdateIncrementalModalProps) {
  return (
    <Modal
      title={t`Configure incremental settings`}
      opened
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <UpdateIncrementalForm
        transform={transform}
        onUpdate={onUpdate}
        onClose={onClose}
      />
    </Modal>
  );
}

type IncrementalValues = {
  incremental: boolean;
  sourceStrategy: "keyset";
  keysetColumn: string | null;
  targetStrategy: "append";
};

const INCREMENTAL_SCHEMA = Yup.object({
  incremental: Yup.boolean().required(),
  sourceStrategy: Yup.string().oneOf(["keyset"]).required(),
  keysetColumn: Yup.string().nullable().when("incremental", {
    is: true,
    then: (schema) => schema.required(Errors.required),
    otherwise: (schema) => schema.nullable(),
  }),
  targetStrategy: Yup.string().oneOf(["append"]).required(),
});

type UpdateIncrementalFormProps = {
  transform: Transform;
  onUpdate: () => void;
  onClose: () => void;
};

function UpdateIncrementalForm({
  transform,
  onUpdate,
  onClose,
}: UpdateIncrementalFormProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const initialValues = useMemo(() => getInitialValues(transform), [transform]);

  const handleSubmit = async (values: IncrementalValues) => {
    // Build the source with incremental strategy if enabled
    const source = values.incremental
      ? {
          ...transform.source,
          "source-incremental-strategy": {
            type: "keyset" as const,
            "keyset-column": values.keysetColumn!,
          },
        }
      : {
          ...transform.source,
          "source-incremental-strategy": undefined,
        };

    // Build the target with incremental strategy if enabled
    const target = values.incremental
      ? {
          type: "table-incremental" as const,
          name: transform.target.name,
          schema: transform.target.schema,
          database: transform.target.database,
          "target-incremental-strategy": {
            type: values.targetStrategy,
          },
        }
      : {
          type: "table" as const,
          name: transform.target.name,
          schema: transform.target.schema,
          database: transform.target.database,
        };

    await updateTransform({
      id: transform.id,
      source,
      target,
    }).unwrap();

    onUpdate();
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={INCREMENTAL_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values }) => (
        <Form>
          <Stack gap="lg">
            <FormCheckbox
              name="incremental"
              label={t`Make this transform incremental`}
              description={t`Incremental transforms only process new or changed data`}
            />
            {values.incremental && (
              <>
                {(() => {
                  // Check if this is a native query
                  if (transform.source.type !== "query") {
                    return null;
                  }
                  const query = transform.source.query as any;
                  const isNativeQuery =
                    query.stages?.[0]?.["lib/type"] === "mbql.stage/native" ||
                    query.stages?.[0]?.native != null;

                  return isNativeQuery ? (
                      <Alert variant="info" icon="info">
                          {t`Ensure your query contains WHERE filter on the keyset column. You may want to use:`}{" "}
                          <strong>{`[[AND id > {{watermark}}]]`}</strong>
                      </Alert>
                  ) : null;
                })()}
                <FormSelect
                  name="sourceStrategy"
                  label={t`Source Strategy`}
                  description={t`How to track which rows to process`}
                  data={[
                    { value: "keyset", label: t`Keyset` },
                  ]}
                />
                {values.sourceStrategy === "keyset" && (
                  <FormTextInput
                    name="keysetColumn"
                    label={t`Keyset Column`}
                    placeholder={t`e.g., id, row_num`}
                    description={t`An integer column used to track incremental updates`}
                  />
                )}
                <FormSelect
                  name="targetStrategy"
                  label={t`Target Strategy`}
                  description={t`How to update the target table`}
                  data={[
                    { value: "append", label: t`Append` },
                  ]}
                />
              </>
            )}
            <Group>
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton label={t`Save`} variant="filled" />
            </Group>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}

function getInitialValues(transform: Transform): IncrementalValues {
  const isIncremental = transform.target.type === "table-incremental";
  const keysetColumn =
    transform.source["source-incremental-strategy"]?.type === "keyset"
      ? transform.source["source-incremental-strategy"]["keyset-column"]
      : null;

  return {
    incremental: isIncremental,
    sourceStrategy: "keyset",
    keysetColumn: isIncremental ? keysetColumn : "id",
    targetStrategy: "append",
  };
}
