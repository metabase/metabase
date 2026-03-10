import { useClickOutside, useDisclosure } from "@mantine/hooks";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  Box,
  Button,
  FixedSizeIcon,
  Group,
  Loader,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { Database, DatabaseId, SchemaName } from "metabase-types/api";

import S from "./SchemaPickerInput.module.css";

interface SchemaPickerInputProps {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  isLoading: boolean;
  onChange?: () => void;
}

export function SchemaPickerInput({
  databaseId,
  schema,
  isLoading,
  onChange,
}: SchemaPickerInputProps) {
  const dispatch = useDispatch();
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const [selectedDatabaseId, setSelectedDatabaseId] =
    useState<DatabaseId | null>(null);

  const { data: databasesResponse, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();

  const schemaQueryDatabaseId =
    selectedDatabaseId ??
    (databaseId != null && schema == null ? databaseId : null);

  // Single top-level schema query shared by picker flow and button label fallback.
  const { data: queriedSchemas, isLoading: isLoadingSchemas } =
    useListDatabaseSchemasQuery(
      schemaQueryDatabaseId != null ? { id: schemaQueryDatabaseId } : skipToken,
    );

  // Some drivers can return [""]. Treat blank schema names as no schemas.
  const normalizedSchemas = useMemo(() => {
    return (queriedSchemas ?? []).filter(
      (schemaName): schemaName is SchemaName => schemaName.trim().length > 0,
    );
  }, [queriedSchemas]);

  const schemas = queriedSchemas == null ? undefined : normalizedSchemas;

  const databases = useMemo(() => {
    return databasesResponse?.data?.filter((db) => !db.is_saved_questions);
  }, [databasesResponse]);

  const selectedDatabase = useMemo(() => {
    return databases?.find((db) => db.id === databaseId);
  }, [databases, databaseId]);

  // Auto-select when database has a single schema
  useEffect(() => {
    if (selectedDatabaseId != null && schemas != null) {
      if (schemas.length === 1) {
        // Single schema - include it in the URL
        const url = Urls.dataStudioErdSchema(selectedDatabaseId, schemas[0]);
        onChange?.();
        dispatch(push(url));
        setSelectedDatabaseId(null);
        close();
      } else if (schemas.length === 0) {
        // No schemas - just use database
        const url = Urls.dataStudioErdDatabase(selectedDatabaseId);
        onChange?.();
        dispatch(push(url));
        setSelectedDatabaseId(null);
        close();
      }
    }
  }, [schemas, selectedDatabaseId, onChange, dispatch, close]);

  const handleDatabaseClick = useCallback((dbId: DatabaseId) => {
    setSelectedDatabaseId(dbId);
  }, []);

  const handleSchemaClick = useCallback(
    (schemaName: SchemaName) => {
      if (selectedDatabaseId != null) {
        const url = Urls.dataStudioErdSchema(selectedDatabaseId, schemaName);
        onChange?.();
        dispatch(push(url));
        setSelectedDatabaseId(null);
        close();
      }
    },
    [selectedDatabaseId, onChange, dispatch, close],
  );

  const handleBack = useCallback(() => {
    setSelectedDatabaseId(null);
  }, []);

  const handleClear = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onChange?.();
      dispatch(push(Urls.dataStudioErdBase()));
    },
    [onChange, dispatch],
  );

  const handleClose = useCallback(() => {
    setSelectedDatabaseId(null);
    close();
  }, [close]);

  const clickOutsideRef = useClickOutside(() => {
    if (opened) {
      handleClose();
    }
  });

  const hasSelection = databaseId != null;
  // Show explicit schema, or auto-selected schema (single schema)
  const autoSelectedSchema =
    selectedDatabaseId == null && schemas?.length === 1 ? schemas[0] : null;
  const displaySchema = schema ?? autoSelectedSchema;
  // Display "Database / Schema" or just "Database"
  const displayLabel = selectedDatabase
    ? displaySchema
      ? `${selectedDatabase.name} / ${displaySchema}`
      : selectedDatabase.name
    : null;

  return (
    <Box ref={clickOutsideRef}>
      <Popover
        opened={opened}
        onClose={handleClose}
        withinPortal={false}
        position="bottom-start"
        shadow="md"
        width={320}
      >
        <Popover.Target>
          {hasSelection ? (
            <Button
              bg="background-primary"
              className={S.triggerButton}
              leftSection={
                <FixedSizeIcon name={displaySchema ? "folder" : "database"} />
              }
              rightSection={
                isLoading ? (
                  <Loader size="xs" />
                ) : (
                  <FixedSizeIcon
                    name="close"
                    display="block"
                    aria-label={t`Clear`}
                    onClick={handleClear}
                  />
                )
              }
              data-testid="schema-picker-button"
              onClick={toggle}
            >
              {displayLabel}
            </Button>
          ) : (
            <Button
              className={S.triggerButton}
              variant="default"
              leftSection={<FixedSizeIcon name="database" c="text-tertiary" />}
              rightSection={
                isLoading ? (
                  <Loader size="xs" />
                ) : (
                  <FixedSizeIcon name="chevrondown" c="text-tertiary" />
                )
              }
              data-testid="schema-picker-button"
              onClick={open}
            >
              <Text c="text-secondary" fw={700}>
                {t`Pick a database to view`}
              </Text>
            </Button>
          )}
        </Popover.Target>

        <Popover.Dropdown p="sm">
          {selectedDatabaseId != null ? (
            isLoadingSchemas ? (
              <Stack align="center" justify="center" py="md">
                <Loader size="sm" />
              </Stack>
            ) : schemas != null && schemas.length > 1 ? (
              <SchemaList
                schemas={schemas}
                databaseName={
                  databases?.find((db) => db.id === selectedDatabaseId)?.name
                }
                onSelect={handleSchemaClick}
                onBack={handleBack}
              />
            ) : (
              <Stack align="center" justify="center" py="md">
                <Loader size="sm" />
              </Stack>
            )
          ) : isLoadingDatabases ? (
            <Stack align="center" justify="center" py="md">
              <Loader size="sm" />
            </Stack>
          ) : (
            <DatabaseList
              databases={databases ?? []}
              onSelect={handleDatabaseClick}
            />
          )}
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}

interface DatabaseListProps {
  databases: Database[];
  onSelect: (databaseId: DatabaseId) => void;
}

function DatabaseList({ databases, onSelect }: DatabaseListProps) {
  if (databases.length === 0) {
    return (
      <Stack align="center" justify="center" py="md">
        <Text c="text-tertiary">{t`No databases available`}</Text>
      </Stack>
    );
  }

  return (
    <Stack gap={0}>
      {databases.map((database) => (
        <DatabaseListItem
          key={database.id}
          database={database}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  );
}

interface DatabaseListItemProps {
  database: Database;
  onSelect: (databaseId: DatabaseId) => void;
}

function DatabaseListItem({ database, onSelect }: DatabaseListItemProps) {
  const { data: schemas } = useListDatabaseSchemasQuery({ id: database.id });
  const hasMultipleSchemas = schemas != null && schemas.length > 1;

  return (
    <UnstyledButton
      className={S.listItem}
      onClick={() => onSelect(database.id)}
      aria-label={database.name}
    >
      <Group gap="sm" wrap="nowrap" justify="space-between">
        <Group gap="sm" wrap="nowrap" style={{ overflow: "hidden" }}>
          <FixedSizeIcon name="database" c="text-secondary" />
          <Text truncate>{database.name}</Text>
        </Group>
        {hasMultipleSchemas && (
          <FixedSizeIcon name="chevronright" c="text-tertiary" />
        )}
      </Group>
    </UnstyledButton>
  );
}

interface SchemaListProps {
  schemas: SchemaName[];
  databaseName?: string;
  onSelect: (schema: SchemaName) => void;
  onBack: () => void;
}

function SchemaList({
  schemas,
  databaseName,
  onSelect,
  onBack,
}: SchemaListProps) {
  return (
    <Stack gap={0}>
      <UnstyledButton
        className={S.listItem}
        onClick={onBack}
        aria-label={t`Back to databases`}
      >
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="chevronleft" c="text-secondary" />
          <Text truncate c="text-secondary">
            {databaseName ?? t`Back`}
          </Text>
        </Group>
      </UnstyledButton>
      <Box className={S.divider} />
      {schemas.map((schemaName) => (
        <UnstyledButton
          key={schemaName}
          className={S.listItem}
          onClick={() => onSelect(schemaName)}
          aria-label={schemaName}
        >
          <Group gap="sm" wrap="nowrap">
            <FixedSizeIcon name="folder" c="text-secondary" />
            <Text truncate>{schemaName}</Text>
          </Group>
        </UnstyledButton>
      ))}
    </Stack>
  );
}
