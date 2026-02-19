import { useEffect, useState } from "react";
import { c, t } from "ttag";
import * as Yup from "yup";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  Form,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "metabase/forms";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import {
  Box,
  Card,
  Divider,
  Flex,
  Group,
  Icon,
  List,
  Loader,
  Progress,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type {
  PreviewDatabaseReplicationResponse,
  TableInfo,
} from "metabase-enterprise/api/database-replication";
import type { Database, DatabaseId } from "metabase-types/api";

export interface DatabaseReplicationFormFields {
  databaseId: DatabaseId;
  schemaFiltersType: "all" | "inclusion" | "exclusion";
  schemaFiltersPatterns: string;
}

const validationSchema = Yup.object({
  schemaFiltersType: Yup.string().oneOf(["all", "inclusion", "exclusion"]),
  schemaFiltersPatterns: Yup.string(),
});

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

const calculateStorageUtilizationPercent = (
  previewResponse: PreviewDatabaseReplicationResponse | undefined,
): number | undefined => {
  return typeof previewResponse?.totalEstimatedRowCount === "number" &&
    typeof previewResponse?.freeQuota === "number" &&
    previewResponse.freeQuota > 0
    ? (previewResponse.totalEstimatedRowCount / previewResponse.freeQuota) * 100
    : undefined;
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

  const [schemaFiltersType, setSchemaFiltersType] = useState(
    initialValues.schemaFiltersType,
  );
  const [schemaFiltersPatterns, setSchemaFiltersPatterns] = useState("");
  const debouncedSchemaFiltersPatterns = useDebouncedValue(
    schemaFiltersPatterns,
    SEARCH_DEBOUNCE_DURATION,
  );
  const isValidSchemaFiltersPatterns = !!debouncedSchemaFiltersPatterns.length;
  const [showNoSyncTables, setShowNoSyncTables] = useState(false);
  const [showReplicatedTables, setShowReplicatedTables] = useState(false);

  const [previewResponseLoading, setPreviewResponseLoading] = useState(false);
  const [previewResponse, setPreviewResponse] =
    useState<PreviewDatabaseReplicationResponse>();
  useEffect(() => {
    setPreviewResponseLoading(true);
    preview(
      {
        databaseId: database.id,
        schemaFiltersType,
        schemaFiltersPatterns: debouncedSchemaFiltersPatterns,
      },
      (res) => {
        setPreviewResponse(res);
        setPreviewResponseLoading(false);
      },
      () => setPreviewResponseLoading(false),
    );
  }, [preview, database.id, debouncedSchemaFiltersPatterns, schemaFiltersType]);

  const storageUtilizationPercent =
    calculateStorageUtilizationPercent(previewResponse);

  const noSyncTables: TableInfo[] = [];
  unionInPlace(noSyncTables, previewResponse?.tablesWithoutPk);
  unionInPlace(noSyncTables, previewResponse?.tablesWithoutOwnerMatch);

  const replicatedTables = previewResponse?.replicatedTables ?? [];

  const hasNoPk = (table: TableInfo) =>
    previewResponse?.tablesWithoutPk?.includes(table) ?? false;
  const hasOwnerMismatch = (table: TableInfo) =>
    previewResponse?.tablesWithoutOwnerMatch?.includes(table) ?? false;
  const noSyncReason = (table: TableInfo) =>
    hasNoPk(table)
      ? t`(no primary key)`
      : hasOwnerMismatch(table)
        ? t`(owner mismatch)`
        : undefined;

  const errorSection =
    previewResponse && !previewResponse.canSetReplication ? (
      <>
        <Divider />
        {previewResponse.errors?.noTables ? (
          <Text>{t`Nothing to replicate. Please select schemas containing at least one table to be replicated.`}</Text>
        ) : previewResponse.errors?.noQuota ? (
          <>
            <Text>{t`Not enough storage. Please upgrade your plan or modify the replication scope by excluding schemas.`}</Text>
            <ExternalLink href={storeUrl}>{t`Get more storage`}</ExternalLink>
          </>
        ) : null}
      </>
    ) : null;

  return (
    <Stack>
      <FormProvider
        initialValues={initialValues}
        onSubmit={onSubmit}
        validationSchema={validationSchema}
      >
        {({ values }) => (
          <Form>
            <Stack>
              <FormSelect
                name="schemaFiltersType"
                label={t`Select schemas to replicate`}
                onChange={(value) =>
                  setSchemaFiltersType(
                    value as typeof initialValues.schemaFiltersType,
                  )
                }
                data={[
                  { value: "all", label: t`All` },
                  { value: "inclusion", label: t`Only these…` },
                  { value: "exclusion", label: t`All except…` },
                ]}
              />

              {values.schemaFiltersType !== "all" && (
                <Box>
                  <Text c="text-secondary" fz="sm">{c(
                    "{0} is either NOT or empty string",
                  )
                    .t`Comma separated names of schemas that should ${values.schemaFiltersType === "exclusion" ? "NOT " : ""}be replicated`}</Text>
                  <FormTextarea
                    name="schemaFiltersPatterns"
                    placeholder={t`e.g. public, auth`}
                    maxRows={5}
                    minRows={2}
                    onChange={({ target: { value } }) =>
                      setSchemaFiltersPatterns(value)
                    }
                  />
                  {previewResponse?.errors?.invalidSchemaFiltersPattern && (
                    <Text c="error" fz="sm" mt="xs">
                      {t`Invalid schema filters pattern`}
                    </Text>
                  )}
                </Box>
              )}

              <Card radius="md" bg="background-secondary" p={0} shadow="none">
                <Flex
                  align="flex-start"
                  direction="row"
                  gap="sm"
                  justify="flex-start"
                  wrap="nowrap"
                  p="md"
                >
                  <Icon name="info_outline" size={16} mt="1px" />
                  <Box>
                    <Text fz="md" lh="1rem">
                      {t`Tables without primary key or with owner mismatch`}{" "}
                      <strong>{t`will not be replicated`}</strong>.
                    </Text>
                    <UnstyledButton
                      variant="subtle"
                      size="xs"
                      onClick={() => setShowNoSyncTables(!showNoSyncTables)}
                      c="brand"
                      fz="md"
                      h="auto"
                      mt="xs"
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
                        <Text span c="brand">
                          {showNoSyncTables
                            ? t`Hide tables (${noSyncTables.length})`
                            : t`Show tables (${noSyncTables.length})`}
                        </Text>
                        <Icon
                          name={showNoSyncTables ? "chevronup" : "chevrondown"}
                          size={12}
                        />
                      </Flex>
                    </UnstyledButton>
                  </Box>
                </Flex>

                {showNoSyncTables && (
                  <>
                    <Divider />
                    <Box
                      mah={180}
                      px="md"
                      style={{
                        overflowY: "auto",
                      }}
                    >
                      <List spacing="xs" size="sm" fz="md" ml="sm" my="md">
                        {noSyncTables.map((table) => (
                          <List.Item
                            key={`${table.tableSchema}.${table.tableName}`}
                            fz="md"
                          >
                            <Text fz="md">
                              <Text
                                span
                                c="text-primary"
                                display="inline"
                                fw="500"
                              >
                                {table.tableSchema}
                              </Text>
                              <Text span c="text-secondary" display="inline">
                                .{table.tableName}
                              </Text>{" "}
                              <Text span c="text-tertiary" display="inline">
                                {noSyncReason(table)}
                              </Text>
                            </Text>
                          </List.Item>
                        ))}
                      </List>
                    </Box>
                  </>
                )}
              </Card>

              <Card radius="md" bg="background-secondary" p={0} shadow="none">
                <Flex
                  align="flex-start"
                  direction="row"
                  gap="sm"
                  justify="flex-start"
                  wrap="nowrap"
                  p="md"
                >
                  <Icon name="check" size={16} mt="1px" />
                  <Box>
                    <Text fz="md" lh="1rem">
                      {t`The following tables will be replicated.`}
                    </Text>
                    <UnstyledButton
                      variant="subtle"
                      size="xs"
                      onClick={() =>
                        setShowReplicatedTables(!showReplicatedTables)
                      }
                      c="brand"
                      fz="md"
                      h="auto"
                      mt="xs"
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
                        <Text span c="brand">
                          {showReplicatedTables
                            ? t`Hide tables (${replicatedTables.length})`
                            : t`Show tables (${replicatedTables.length})`}
                        </Text>
                        <Icon
                          name={
                            showReplicatedTables ? "chevronup" : "chevrondown"
                          }
                          size={12}
                        />
                      </Flex>
                    </UnstyledButton>
                  </Box>
                </Flex>

                {showReplicatedTables && (
                  <>
                    <Divider />
                    <Box
                      mah={180}
                      px="md"
                      style={{
                        overflowY: "auto",
                      }}
                    >
                      <List spacing="xs" size="sm" fz="md" ml="sm" my="md">
                        {replicatedTables.map((table) => (
                          <List.Item
                            key={`${table.tableSchema}.${table.tableName}`}
                            fz="md"
                          >
                            <Text fz="md">
                              <Text
                                span
                                c="text-primary"
                                display="inline"
                                fw="500"
                              >
                                {table.tableSchema}
                              </Text>
                              <Text span c="text-secondary" display="inline">
                                .{table.tableName}
                              </Text>
                            </Text>
                          </List.Item>
                        ))}
                      </List>
                    </Box>
                  </>
                )}
              </Card>

              <Card
                radius="md"
                bg="background-secondary"
                p="md"
                my="sm"
                shadow="none"
              >
                <Stack>
                  <Group justify="space-between">
                    <Box ta="left">
                      <Text c="text-tertiary">{database.name}</Text>
                      {!previewResponseLoading &&
                      typeof previewResponse?.totalEstimatedRowCount ===
                        "number" ? (
                        <Text fw="bold">
                          {t`${compactEnglishNumberFormat.format(previewResponse.totalEstimatedRowCount)} rows`}
                        </Text>
                      ) : (
                        <Skeleton height="1.5em" width="10em" />
                      )}
                    </Box>

                    {previewResponseLoading && <Loader />}

                    <Box ta="right">
                      <Text c="text-tertiary">{t`Available Cloud Storage`}</Text>
                      {!previewResponseLoading &&
                      typeof previewResponse?.freeQuota === "number" ? (
                        <Text fw="bold" w="100%">
                          {t`${compactEnglishNumberFormat.format(previewResponse.freeQuota)} rows`}
                        </Text>
                      ) : (
                        <Skeleton height="1.5em" width="10em" />
                      )}
                    </Box>
                  </Group>

                  {!previewResponseLoading &&
                  typeof storageUtilizationPercent === "number" ? (
                    <Progress
                      value={storageUtilizationPercent}
                      color={
                        previewResponse?.canSetReplication ? "success" : "error"
                      }
                    />
                  ) : (
                    <Skeleton height="1em" width="100%" />
                  )}

                  {errorSection}
                </Stack>
              </Card>

              <Flex justify="end">
                <Group align="center" gap="sm">
                  <FormSubmitButton
                    disabled={
                      (isValidSchemaFiltersPatterns &&
                        previewResponseLoading) ||
                      !previewResponse?.canSetReplication
                    }
                    label={t`Start replication`}
                    variant="filled"
                    mt="xs"
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
