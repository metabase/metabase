import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Flex, Group, Text } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

const styles = {
  wrapperProps: {
    fw: 400,
  },
  labelProps: {
    fz: "0.875rem",
    mb: "0.75rem",
  },
};

export interface DWHReplicationFormFields {
  databaseId: DatabaseId;
  schemaSelect: "all" | "include" | "exclude";
  schemas: string;
}

const validationSchema = Yup.object({
  schemaSelect: Yup.string().oneOf(["all", "include", "exclude"]),
  schemas: Yup.string(),
});

type IFieldError =
  | string
  | {
      message: string;
    }
  | {
      errors: { [key: string]: any };
    };

const isFieldError = (error: unknown): error is IFieldError =>
  typeof error === "string" ||
  (error instanceof Object &&
    (("message" in error && typeof error.message === "string") ||
      ("errors" in error &&
        error.errors instanceof Object &&
        "schemas" in error.errors &&
        typeof error.errors.schemas === "string")));

export const handleFieldError = (error: unknown) => {
  if (isFieldError(error)) {
    if (typeof error === "string") {
      throw { data: { errors: { schemas: error } } };
    } else if ("message" in error) {
      throw { data: { errors: { schemas: error.message } } };
    } else if ("errors" in error) {
      throw { data: error };
    }
  }
};

export const DatabaseReplicationForm = ({
  onSubmit,
  onCancel,
  initialValues,
}: {
  onSubmit: (_: DWHReplicationFormFields) => void;
  onCancel: () => void;
  initialValues: DWHReplicationFormFields;
}) => (
  <FormProvider
    initialValues={initialValues}
    onSubmit={onSubmit}
    validationSchema={validationSchema}
  >
    {({ dirty, values, setFieldValue }) => (
      <Form>
        <FormSelect
          name="schemaSelect"
          label={t`Select schemas to replicate`}
          onChange={() => setFieldValue("excludeSchemas", null)}
          data={[
            { value: "all", label: t`All` },
            { value: "include", label: t`Only these…` },
            { value: "exclude", label: t`All except…` },
          ]}
          {...styles}
        />
        {values.schemaSelect !== "all" ? (
          <>
            <Text c="text-light">{t`Comma separated names of schemas that should ${values.schemaSelect === "exclude" ? "NOT " : ""}be replicated`}</Text>
            <FormTextInput
              name="schemas"
              placeholder="e.g. public, auth"
              {...styles}
            />
          </>
        ) : undefined}
        <Text c="text-light">{t`You will get an email once your data is ready to use.`}</Text>
        <Flex justify="end">
          <Group>
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              disabled={!dirty}
              label={t`Start replication`}
              variant="filled"
            />
          </Group>
        </Flex>
      </Form>
    )}
  </FormProvider>
);
