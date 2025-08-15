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
  Card,
  Divider,
  Flex,
  Group,
  Icon,
  List,
  Progress,
  Stack,
  Text,
  UnstyledButton,
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

// JavaScript 2024 `Set.union` does not appear to be available?
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/union
const unionInPlace = <T,>(set: T[], values?: T[]) => {
  values?.forEach((v) => {
    if (!set.includes(v)) {
      set.push(v);
    }
  });
};

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
  const [showNoSyncTables, setShowNoSyncTables] = useState(false);

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

  const noSyncTables: { name: string; schema: string }[] = [];
  unionInPlace(noSyncTables, previewResponse?.tablesWithoutPk);
  unionInPlace(noSyncTables, previewResponse?.tablesWithoutOwnerMatch);

  const hasNoPk = (table: { schema: string; name: string }) =>
    previewResponse?.tablesWithoutPk?.includes(table) ?? false;
  const hasOwnerMismatch = (table: { schema: string; name: string }) =>
    previewResponse?.tablesWithoutOwnerMatch?.includes(table) ?? false;
  const noSyncReason = (table: { schema: string; name: string }) =>
    hasNoPk(table)
      ? "(no primary key)"
      : hasOwnerMismatch(table)
        ? "(owner mismatch)"
        : undefined;

  return (
    <Stack>
      <Card radius="md" bg="bg-light" p="md" my="sm">
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
            <Stack>
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

              {values.schemaSelect !== "all" && (
                <>
                  <Text c="text-light">{t`Comma separated names of schemas that should ${values.schemaSelect === "exclude" ? "NOT " : ""}be replicated`}</Text>
                  <FormTextInput
                    name="schemaFilters"
                    placeholder="e.g. public, auth"
                    onBlur={({ target: { value } }) => setSchemaFilters(value)}
                    {...styles}
                  />
                </>
              )}

              {noSyncTables.length > 0 && (
                <Card radius="md" bg="bg-light" p={0}>
                  <Flex
                    align="flex-start"
                    direction="row"
                    gap="sm"
                    justify="flex-start"
                    wrap="nowrap"
                    p="md"
                  >
                    <Icon name="info_outline" size={16} maw={16} mt={1} />
                    <Box>
                      <Text fz="md" lh={1.25}>
                        {t`Tables without primary key or with owner mismatch`}{" "}
                        <b>{t`will not be replicated`}</b>.
                      </Text>
                      <UnstyledButton
                        variant="subtle"
                        size="xs"
                        onClick={() => setShowNoSyncTables(!showNoSyncTables)}
                        c="brand"
                        fz="md"
                        h="auto"
                        p={0}
                        w="auto"
                      >
                        <Flex
                          align="center"
                          direction="row"
                          gap="xs"
                          justify="flex-start"
                          wrap="nowrap"
                        >
                          <Text span>
                            {showNoSyncTables
                              ? t`Hide tables (${noSyncTables.length})`
                              : t`Show tables (${noSyncTables.length})`}
                          </Text>
                          <Icon
                            // className={CS.ml1}
                            // c="brand"
                            name={
                              showNoSyncTables ? "chevronup" : "chevrondown"
                            }
                            size={12}
                          />
                        </Flex>
                      </UnstyledButton>
                    </Box>
                  </Flex>

                  {showNoSyncTables && (
                    <>
                      <Divider />
                      <Box mah={180} p="md">
                        <List spacing="xs" size="sm" fz="md" ml="sm">
                          {noSyncTables.map((table) => (
                            <List.Item
                              key={`${table.schema}.${table.name}`}
                              c="text-medium"
                              ff="Monaco, 'Lucida Console', monospace"
                              fz="md"
                            >
                              <Box component="span" c="text-dark" fw="500">
                                {table.schema}
                              </Box>
                              <Box component="span" c="text-medium">
                                .{table.name}
                              </Box>{" "}
                              <Box component="span" c="text-light">
                                {noSyncReason(table)}
                              </Box>
                            </List.Item>
                          ))}
                        </List>
                      </Box>
                    </>
                  )}
                </Card>
              )}

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
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Stack>
  );
};
