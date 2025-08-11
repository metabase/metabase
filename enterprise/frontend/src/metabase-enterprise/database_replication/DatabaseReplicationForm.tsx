import { useEffect, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import {
  Form,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { colors } from "metabase/lib/colors";
import {
  Box,
  Button,
  Card,
  Divider,
  Flex,
  Group,
  List,
  Progress,
  Stack,
  Text,
} from "metabase/ui";
import type { PreviewDatabaseReplicationResponse } from "metabase-enterprise/api/database-replication";
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

export interface DatabaseReplicationFormFields {
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

const compactEnglishNumberFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const DatabaseReplicationForm = ({
  database,
  onSubmit,
  preview,
  initialValues,
}: {
  database: Database;
  onSubmit: (_: DatabaseReplicationFormFields) => void;
  preview: (
    fields: DatabaseReplicationFormFields,
    handleResponse: (_: PreviewDatabaseReplicationResponse) => void,
    handleError: (error: unknown) => void,
  ) => void;
  initialValues: DatabaseReplicationFormFields;
}) => {
  const storeUrl = useStoreUrl("account/storage");

  // FIXME: Can we get all values of the form at once?
  const [schemaSelect, setSchemaSelect] = useState(initialValues.schemaSelect);
  const [schemaFilters, setSchemaFilters] = useState("");
  const [showTablesWithoutPk, setShowTablesWithoutPk] = useState(false);

  const [previewResponseLoading, setPreviewResponseLoading] = useState(false);
  const [previewResponse, setPreviewResponse] =
    useState<PreviewDatabaseReplicationResponse>();
  useEffect(() => {
    setPreviewResponseLoading(true);
    preview(
      { databaseId: database.id, schemaSelect, schemaFilters },
      (res) => {
        setPreviewResponse(res);
        setPreviewResponseLoading(false);
      },
      () => setPreviewResponseLoading(false),
    );
  }, [preview, database.id, schemaFilters, schemaSelect]);

  return (
    <>
      <Card radius="md" bg="bg-light" p="md" mb="md">
        <Stack>
          <Group justify="space-between">
            <div>
              <Text c="text-light">{database.name}</Text>
              <Text fw="bold">
                {typeof previewResponse?.totalEstimatedRowCount === "number"
                  ? t`${compactEnglishNumberFormat.format(previewResponse.totalEstimatedRowCount)} rows`
                  : "…"}
              </Text>
            </div>
            <div>
              <Text c="text-light">{t`Available Cloud Storage`}</Text>
              <Text fw="bold">
                {typeof previewResponse?.freeQuota === "number"
                  ? t`${compactEnglishNumberFormat.format(previewResponse.freeQuota)} rows`
                  : "…"}
              </Text>
            </div>
          </Group>
          <Progress
            value={
              typeof previewResponse?.totalEstimatedRowCount === "number" &&
              typeof previewResponse?.freeQuota === "number" &&
              previewResponse.freeQuota > 0
                ? (previewResponse.totalEstimatedRowCount /
                    previewResponse.freeQuota) *
                  100
                : 0
            }
            color={
              previewResponse?.canSetReplication ? colors.success : colors.error
            }
          />
          {previewResponse && !previewResponse.canSetReplication ? (
            <>
              <Divider />
              <Text>{t`Not enough storage. Please upgrade your plan or modify the replication scope by excluding schemas.`}</Text>
              <ExternalLink href={storeUrl}>{t`Get more storage`}</ExternalLink>
            </>
          ) : undefined}
        </Stack>
      </Card>
      <FormProvider
        initialValues={initialValues}
        onSubmit={onSubmit}
        validationSchema={validationSchema}
      >
        {({ values, setFieldValue }) => (
          <Form>
            <FormSelect
              name="schemaSelect"
              label={t`Select schemas to replicate`}
              onChange={(value) => {
                setSchemaSelect(value as typeof initialValues.schemaSelect);
                if (value === "all") {
                  setFieldValue("schemaFields", "");
                }
              }}
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
                  name="schemaFilters"
                  placeholder="e.g. public, auth"
                  onBlur={({ target: { value } }) => setSchemaFilters(value)}
                  {...styles}
                />
              </>
            ) : undefined}
            {(previewResponse?.tablesWithoutPk?.length ?? 0) > 0 ? (
              <Card radius="md" bg="bg-light" p="md">
                <Stack>
                  <Text c="text-light">
                    {t`Tables without primary keys`}{" "}
                    <b>{t`will not be replicated`}</b>.
                  </Text>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => setShowTablesWithoutPk(!showTablesWithoutPk)}
                    h="auto"
                    p={0}
                    td="underline"
                    style={{ alignSelf: "flex-start" }}
                  >
                    {showTablesWithoutPk
                      ? t`Hide tables (${previewResponse?.tablesWithoutPk?.length})`
                      : t`Show tables (${previewResponse?.tablesWithoutPk?.length})`}
                  </Button>
                  {showTablesWithoutPk && (
                    <List spacing="xs" size="sm">
                      {previewResponse?.tablesWithoutPk?.map(
                        ({ schema, name }) => (
                          <List.Item
                            key={`${schema}.${name}`}
                            c="text-medium"
                            ff="Monaco, 'Lucida Console', monospace"
                            fz="md"
                          >
                            <Box component="span" c="text-dark" fw="500">
                              {schema}
                            </Box>
                            <Box component="span" c="text-medium">
                              .{name}
                            </Box>
                          </List.Item>
                        ),
                      )}
                    </List>
                  )}
                </Stack>
              </Card>
            ) : undefined}
            <Text c="text-light">{t`You will get an email once your data is ready to use.`}</Text>
            <Flex justify="end">
              <Group>
                <FormSubmitButton
                  disabled={!previewResponse?.canSetReplication}
                  loading={previewResponseLoading}
                  label={t`Start replication`}
                  variant="filled"
                />
              </Group>
            </Flex>
          </Form>
        )}
      </FormProvider>
    </>
  );
};
