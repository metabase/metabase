import { Field, Form, Formik } from "formik";
import { t } from "ttag";
import * as Yup from "yup";

import { Button, Group, Modal, Stack, TextInput } from "metabase/ui";
import { useCreateTransformMutation } from "metabase-enterprise/api";
import type { Transform, TransformSource } from "metabase-types/api";

type PythonTransformApiSource = {
  type: "python";
  body: string;
  "target-database": number;
  "source-database": number;
  "source-tables": Record<string, number>;
};

type CreatePythonTransformModalProps = {
  source: TransformSource & { type: "python" };
  onCreate: (transform: Transform) => void;
  onClose: () => void;
};

type FormValues = {
  name: string;
  description: string | null;
  targetSchema: string | null;
  targetName: string;
};

const getValidationSchema = () =>
  Yup.object({
    name: Yup.string().required(t`Name is required`),
    description: Yup.string().nullable(),
    targetSchema: Yup.string().nullable(),
    targetName: Yup.string().required(t`Table name is required`),
  });

export function CreatePythonTransformModal({
  source,
  onCreate,
  onClose,
}: CreatePythonTransformModalProps) {
  const [createTransform] = useCreateTransformMutation();

  const initialValues: FormValues = {
    name: "",
    description: null,
    targetSchema: "python_transforms",
    targetName: "",
  };

  const handleSubmit = async (values: FormValues) => {
    try {
      const transformedSource: PythonTransformApiSource = {
        type: "python",
        body: source.body,
        "target-database": source["source-database"], // for now the same
        "source-database": source["source-database"],
        "source-tables": source["source-tables"] || {},
      };

      const transform = await createTransform({
        name: values.name,
        description: values.description,
        source: transformedSource as any,
        target: {
          type: "table",
          schema: values.targetSchema,
          name: values.targetName,
        },
      }).unwrap();

      onCreate(transform);
    } catch (error) {
      console.error("Error creating Python transform:", error);
      // TODO: Show error toast
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={t`Create Python Transform`}
      size="md"
    >
      <Formik
        initialValues={initialValues}
        validationSchema={getValidationSchema()}
        onSubmit={handleSubmit}
      >
        {({ isSubmitting, isValid }) => (
          <Form>
            <Stack gap="md">
              <Field name="name">
                {({ field, meta }: any) => (
                  <TextInput
                    {...field}
                    label={t`Transform name`}
                    placeholder={t`My Python Transform`}
                    error={meta.touched && meta.error}
                  />
                )}
              </Field>

              <Field name="description">
                {({ field }: any) => (
                  <TextInput
                    {...field}
                    label={t`Description (optional)`}
                    placeholder={t`What does this transform do?`}
                  />
                )}
              </Field>

              <Field name="targetName">
                {({ field, meta }: any) => (
                  <TextInput
                    {...field}
                    label={t`Output table name`}
                    placeholder={t`my_python_transform`}
                    error={meta.touched && meta.error}
                  />
                )}
              </Field>

              <Field name="targetSchema">
                {({ field }: any) => (
                  <TextInput
                    {...field}
                    label={t`Schema (optional)`}
                    placeholder={t`python_transforms`}
                  />
                )}
              </Field>

              <Group justify="flex-end" mt="md">
                <Button variant="subtle" onClick={onClose}>
                  {t`Cancel`}
                </Button>
                <Button
                  type="submit"
                  loading={isSubmitting}
                  disabled={!isValid}
                >
                  {t`Create transform`}
                </Button>
              </Group>
            </Stack>
          </Form>
        )}
      </Formik>
    </Modal>
  );
}
