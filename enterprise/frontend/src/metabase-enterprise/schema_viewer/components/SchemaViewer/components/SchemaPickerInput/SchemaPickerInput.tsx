import { useClickOutside, useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useDispatch } from "metabase/redux";
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
import * as Urls from "metabase/urls";
import type { Database, DatabaseId, SchemaName } from "metabase-types/api";

import S from "./SchemaPickerInput.module.css";

type SchemaPickerInputProps = {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  onSchemaChange: () => void;
};

export function SchemaPickerInput({
  databaseId,
  schema,
  onSchemaChange,
}: SchemaPickerInputProps) {
  const dispatch = useDispatch();
  const [opened, { open, close, toggle }] = useDisclosure(databaseId == null);
  const [selectedDatabaseId, setSelectedDatabaseId] =
    useState<DatabaseId | null>(null);
  // Set when the user clicks "Back" from the auto-opened schema list, so
  // we stop deriving "show schema list for current DB" and let them see
  // the DB list instead. Cleared when the popover fully closes.
  const [hasNavigatedBackToDbs, setHasNavigatedBackToDbs] = useState(false);

  const { data: databasesResponse, isLoading: isLoadingDatabases } =
    useListDatabasesQuery({ include: "schemas" });

  const databases = useMemo(() => {
    return databasesResponse?.data?.filter((db) => !db.is_saved_questions);
  }, [databasesResponse]);

  // Which database's schemas the popover should currently be listing.
  // - `selectedDatabaseId` is set when the user has clicked a DB row in the
  //   picker to drill into its schemas.
  // - When the popover is opened while a schema is already selected, we
  //   skip the DB list and show the schema list for the current DB so the
  //   user lands directly on (and can re-pick) their current schema —
  //   unless they've explicitly backed out to the DB list.
  const candidateSchemaListDbId =
    selectedDatabaseId ??
    (opened &&
    !hasNavigatedBackToDbs &&
    schema != null &&
    schema.length > 0 &&
    databaseId != null
      ? databaseId
      : null);

  // Fall back to the DB list when we wanted to show a schema list for a DB
  // that isn't in the loaded set (URL points at a non-existent or unreadable
  // DB). Otherwise the dropdown would render an infinite loader with no way
  // to recover.
  const candidateDbMissing =
    candidateSchemaListDbId != null &&
    !isLoadingDatabases &&
    databases != null &&
    !databases.some((d) => d.id === candidateSchemaListDbId);

  const popoverSchemaListDbId = candidateDbMissing
    ? null
    : candidateSchemaListDbId;

  // Schemas for the database currently being previewed in the popover.
  const schemas = useMemo<SchemaName[] | undefined>(() => {
    if (popoverSchemaListDbId == null) {
      return undefined;
    }
    const db = databases?.find((d) => d.id === popoverSchemaListDbId);
    if (db?.schemas == null) {
      return undefined;
    }
    return db.schemas.filter(
      (schemaName): schemaName is SchemaName => schemaName.trim().length > 0,
    );
  }, [databases, popoverSchemaListDbId]);

  // Click on a DB row: if the DB has 0 or 1 schemas there's no choice to
  // offer — navigate directly. Otherwise drill into the schema list.
  const handleDatabaseClick = useCallback(
    (dbId: DatabaseId) => {
      const db = databases?.find((d) => d.id === dbId);
      const dbSchemas = db?.schemas?.filter(
        (schemaName): schemaName is SchemaName => schemaName.trim().length > 0,
      );
      if (dbSchemas != null && dbSchemas.length <= 1) {
        const url = Urls.dataStudioErd({
          databaseId: dbId,
          schema: dbSchemas[0],
        });
        onSchemaChange();
        dispatch(push(url));
        close();
        return;
      }
      setSelectedDatabaseId(dbId);
    },
    [databases, dispatch, close, onSchemaChange],
  );

  const handleSchemaClick = useCallback(
    (schemaName: SchemaName) => {
      // Use the derived id so this works both when the user drilled in via
      // a DB-row click and when we opened directly into the current DB's
      // schema list.
      const dbIdForNavigation = popoverSchemaListDbId;
      if (dbIdForNavigation != null) {
        const url = Urls.dataStudioErd({
          databaseId: dbIdForNavigation,
          schema: schemaName,
        });
        onSchemaChange();
        dispatch(push(url));
        setSelectedDatabaseId(null);
        close();
      }
    },
    [popoverSchemaListDbId, dispatch, close, onSchemaChange],
  );

  const handleBack = useCallback(() => {
    setSelectedDatabaseId(null);
    // Also break out of the "auto-opened schema list" mode — the user
    // explicitly asked to go back to the DB list, so derived DB should
    // not kick us back into the schema list on the next render.
    setHasNavigatedBackToDbs(true);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedDatabaseId(null);
    setHasNavigatedBackToDbs(false);
    close();
  }, [close]);

  // React Flow's pane uses pointerdown handlers that call preventDefault(),
  // which suppresses the follow-up `mousedown`/`click` that Mantine's default
  // useClickOutside listens for. Listen to `pointerdown` (and `touchstart`)
  // instead so clicks on the canvas reliably dismiss the popover.
  const clickOutsideRef = useClickOutside(() => {
    if (opened) {
      handleClose();
    }
  }, ["pointerdown", "touchstart"]);

  const hasSelection = databaseId != null;

  const currentDb =
    databaseId != null
      ? databases?.find((db) => db.id === databaseId)
      : undefined;
  // Only show the URL's `schema` as the trigger label when it actually exists
  // in the DB's schema list. Otherwise fall back to the DB name.
  const schemaExistsOnCurrentDb =
    schema != null &&
    schema.length > 0 &&
    currentDb?.schemas?.includes(schema) === true;

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
              leftSection={<FixedSizeIcon name="database" />}
              rightSection={<FixedSizeIcon name="chevrondown" />}
              data-testid="schema-picker-button"
              onClick={toggle}
            >
              {isLoadingDatabases ? (
                <Loader size="xs" />
              ) : schemaExistsOnCurrentDb ? (
                schema
              ) : (
                (currentDb?.name ?? t`Database`)
              )}
            </Button>
          ) : (
            <Button
              className={S.triggerButton}
              variant="default"
              leftSection={<FixedSizeIcon name="database" c="text-tertiary" />}
              rightSection={
                <FixedSizeIcon name="chevrondown" c="text-tertiary" />
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
          {popoverSchemaListDbId != null ? (
            schemas == null ? (
              <Stack align="center" justify="center" py="md">
                <Loader size="sm" />
              </Stack>
            ) : schemas.length >= 1 ? (
              <SchemaList
                schemas={schemas}
                databaseName={
                  databases?.find((db) => db.id === popoverSchemaListDbId)?.name
                }
                currentSchema={
                  popoverSchemaListDbId === databaseId ? schema : undefined
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

type DatabaseListProps = {
  databases: Database[];
  onSelect: (databaseId: DatabaseId) => void;
};

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

type DatabaseListItemProps = {
  database: Database;
  onSelect: (databaseId: DatabaseId) => void;
};

function DatabaseListItem({ database, onSelect }: DatabaseListItemProps) {
  const hasMultipleSchemas =
    database.schemas != null && database.schemas.length > 1;

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

type SchemaListProps = {
  schemas: SchemaName[];
  databaseName?: string;
  currentSchema?: string;
  onSelect: (schema: SchemaName) => void;
  onBack: () => void;
};

function SchemaList({
  schemas,
  databaseName,
  currentSchema,
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
      {schemas.map((schemaName) => {
        const isCurrent = schemaName === currentSchema;
        return (
          <UnstyledButton
            key={schemaName}
            className={S.listItem}
            onClick={() => onSelect(schemaName)}
            aria-label={schemaName}
            aria-current={isCurrent ? "true" : undefined}
            autoFocus={isCurrent}
          >
            <Group gap="sm" wrap="nowrap" justify="space-between">
              <Group gap="sm" wrap="nowrap" style={{ overflow: "hidden" }}>
                <FixedSizeIcon name="folder" c="text-secondary" />
                <Text truncate fw={isCurrent ? 700 : undefined}>
                  {schemaName}
                </Text>
              </Group>
              {isCurrent && <FixedSizeIcon name="check" c="brand" />}
            </Group>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
