import { useEffect, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { colors } from "metabase/lib/colors";
import { Flex, Group, Progress, Text } from "metabase/ui";
import {
  type PreviewDatabaseReplicationResponse,
  usePreviewDatabaseReplicationMutation,
} from "metabase-enterprise/api/database-replication";
import type { Database, DatabaseId } from "metabase-types/api";

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
  schemaFilters: string;
}

const validationSchema = Yup.object({
  schemaSelect: Yup.string().oneOf(["all", "include", "exclude"]),
  schemaFilters: Yup.string(),
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
  database,
  onSubmit,
  initialValues,
}: {
  database: Database;
  onSubmit: (_: DWHReplicationFormFields) => void;
  onBlurSchemaFilters: (_: string) => void;
  initialValues: DWHReplicationFormFields;
}) => {
  const [schemaFilters, setSchemaFilters] = useState<string>("");
  const [previewDatabaseReplication] = usePreviewDatabaseReplicationMutation();
  const [
    previewDatabaseReplicationResponse,
    setPreviewDatabaseReplicationResponse,
  ] = useState<PreviewDatabaseReplicationResponse>();
  useEffect(() => {
    previewDatabaseReplication({ databaseId: database.id })
      .unwrap()
      .then(setPreviewDatabaseReplicationResponse);
  }, [database.id, previewDatabaseReplication, schemaFilters]);

  const freeQuota = previewDatabaseReplicationResponse?.free_quota;
  const totalEstimatedRowCount =
    previewDatabaseReplicationResponse?.total_estimated_row_count;
  const tablesWithoutPK = previewDatabaseReplicationResponse?.tables_without_pk;
  const canSetReplication =
    previewDatabaseReplicationResponse?.can_set_replication;

  return (
    <>
      {/* FIXME: Get values from Store API and fix the layout to look like the UI design. */}
      <div>
        <Text c="text-light">{database.name}</Text>
        <Text
          style={{ "font-weight": "bold" }}
        >{t`${totalEstimatedRowCount} rows`}</Text>
      </div>
      <div>
        <Text c="text-light">{t`Available Cloud Storage`}</Text>
        <Text style={{ "font-weight": "bold" }}>{t`${freeQuota} rows`}</Text>
      </div>
      <Progress
        value={
          totalEstimatedRowCount && freeQuota && freeQuota > 0
            ? ((totalEstimatedRowCount * 1000) / freeQuota) * 100
            : 0
        }
        color={canSetReplication ? colors.success : colors.error}
      />
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
                  onBlur={({ target: { value } }) => setSchemaFilters(value)}
                  {...styles}
                />
              </>
            ) : undefined}
            <Text c="text-light">{t`You will get an email once your data is ready to use.`}</Text>
            <Flex justify="end">
              <Group>
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
      {(tablesWithoutPK?.length ?? 0) > 0 ? (
        <>
          <Text>
            {t`Tables without primary keys <b>will not be replicated</b>.`}
          </Text>
          <ul>
            {tablesWithoutPK?.map(({ schema, name }) => (
              <li key={`${schema}.${name}`}>
                {schema}.{name}
              </li>
            ))}
          </ul>
        </>
      ) : undefined}
    </>
  );
};
