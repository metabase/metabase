import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  useDiscardTablesFieldValuesMutation,
  useEditTablesMutation,
  useListTablesQuery,
  useRescanTablesFieldValuesMutation,
  useSyncTablesSchemasMutation,
  useUpdateTableMutation,
} from "metabase/api";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  trackDataStudioBulkAttributeUpdated,
  trackDataStudioTableFieldValuesDiscardStarted,
  trackDataStudioTableFieldsRescanStarted,
  trackDataStudioTableSchemaSyncStarted,
} from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  DataSourceInput,
  EntityTypeInput,
  UserInput,
} from "metabase/metadata/components";
import { type DataLayer, useDataLayers } from "metabase/metadata/data-layers";
import {
  getPeriodGranularityOptions,
  getTableRoleOptions,
  isRoleA,
  isTableRole,
  useTableStructures,
  useTablesWithFields,
} from "metabase/metadata/table-structure";
import { PLUGIN_LIBRARY, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { ActionIcon, Icon, Menu, Select } from "metabase/ui";
import type {
  DatabaseId,
  Table,
  TableDataSource,
  UserId,
} from "metabase-types/api";

import {
  DETAILS_CELL_INPUT_CLASS_NAMES,
  DetailPanelHeader,
  DetailsEditableText,
} from "../../DetailPanel";
import { useSelection } from "../../contexts/SelectionContext";

type TableAttributesEditBulkProps = {
  canPublish: boolean;
  hasLibrary: boolean;
  onUpdate: () => void;
  onClose: () => void;
};

type TableModalType = "library" | "publish" | "unpublish";

/**
 * Every value that can be set for many tables at once, in the same sections
 * as a single table's drawer. Per-table values (names, column choices) and
 * read-only details are left out. Each value shows what the tables share,
 * "Mixed" when they differ, or the empty placeholder when none has one.
 */
export function TableAttributesEditBulk({
  canPublish,
  hasLibrary,
  onUpdate,
  onClose,
}: TableAttributesEditBulkProps) {
  const {
    selectedDatabases,
    selectedSchemas,
    selectedTables,
    selectedItemsCount,
  } = useSelection();
  const [modalType, setModalType] = useState<TableModalType>();
  const targetTables = useBulkTargetTables();

  const hasOnlyTablesSelected =
    selectedTables.size > 0 &&
    selectedSchemas.size === 0 &&
    selectedDatabases.size === 0;

  const handleCloseModal = () => {
    setModalType(undefined);
  };

  const handleSuccessCloseModal = () => {
    onUpdate();
    handleCloseModal();
  };

  return (
    <>
      <DetailPanelHeader
        icon="collection2"
        label={t`Bulk edit`}
        title={
          hasOnlyTablesSelected
            ? t`${selectedItemsCount} tables selected`
            : t`Multiple tables selected`
        }
        actions={
          <BulkActionsMenu
            canPublish={canPublish}
            hasLibrary={hasLibrary}
            onAction={setModalType}
          />
        }
        onClose={onClose}
      />

      {/* Every property applies to at least one table once there are any */}
      {targetTables.length > 0 && (
        <>
          <BulkMetadataSection tables={targetTables} />
          <BulkAttributesSection tables={targetTables} onUpdate={onUpdate} />
          <BulkStructureSection tables={targetTables} />
        </>
      )}

      <PLUGIN_LIBRARY.CreateLibraryModal
        title={t`First, let's create your semantic layer`}
        explanatorySentence={t`This is where published tables will go.`}
        isOpened={modalType === "library"}
        onCreate={() => setModalType("publish")}
        onClose={handleCloseModal}
      />

      <PLUGIN_LIBRARY.PublishTablesModal
        isOpened={modalType === "publish"}
        databaseIds={Array.from(selectedDatabases)}
        schemaIds={Array.from(selectedSchemas)}
        tableIds={Array.from(selectedTables)}
        onPublish={handleSuccessCloseModal}
        onClose={handleCloseModal}
      />

      <PLUGIN_LIBRARY.UnpublishTablesModal
        isOpened={modalType === "unpublish"}
        databaseIds={Array.from(selectedDatabases)}
        schemaIds={Array.from(selectedSchemas)}
        tableIds={Array.from(selectedTables)}
        onUnpublish={handleSuccessCloseModal}
        onClose={handleCloseModal}
      />
    </>
  );
}

/** Overflow menu with the actions for the whole selection, like a table's */
function BulkActionsMenu({
  canPublish,
  hasLibrary,
  onAction,
}: {
  canPublish: boolean;
  hasLibrary: boolean;
  onAction: (modalType: TableModalType) => void;
}) {
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const canChangePublishing = canPublish && !remoteSyncReadOnly;
  const { selectedDatabases, selectedSchemas, selectedTables } = useSelection();
  const [syncTablesSchemas] = useSyncTablesSchemasMutation();
  const [rescanTablesFieldValues] = useRescanTablesFieldValuesMutation();
  const [discardTablesFieldValues] = useDiscardTablesFieldValuesMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const selection = {
    database_ids: Array.from(selectedDatabases),
    schema_ids: Array.from(selectedSchemas),
    table_ids: Array.from(selectedTables),
  };

  const handleSyncSchema = async () => {
    const { error } = await syncTablesSchemas(selection);
    if (error) {
      sendErrorToast(t`Failed to start sync`);
      trackDataStudioTableSchemaSyncStarted("failure");
    } else {
      sendSuccessToast(t`Sync triggered`);
      trackDataStudioTableSchemaSyncStarted("success");
    }
  };

  const handleRescan = async () => {
    const { error } = await rescanTablesFieldValues(selection);
    if (error) {
      sendErrorToast(t`Failed to start scan`);
      trackDataStudioTableFieldsRescanStarted("failure");
    } else {
      sendSuccessToast(t`Scan triggered`);
      trackDataStudioTableFieldsRescanStarted("success");
    }
  };

  const handleDiscard = async () => {
    const { error } = await discardTablesFieldValues(selection);
    if (error) {
      sendErrorToast(t`Failed to discard values`);
      trackDataStudioTableFieldValuesDiscardStarted("failure");
    } else {
      sendSuccessToast(t`Discard triggered`);
      trackDataStudioTableFieldValuesDiscardStarted("success");
    }
  };

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon aria-label={t`More actions`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {canChangePublishing && (
          <Menu.Item
            leftSection={<Icon name="publish" />}
            onClick={() => onAction(hasLibrary ? "publish" : "library")}
          >
            {t`Publish`}
          </Menu.Item>
        )}
        {canChangePublishing && hasLibrary && (
          <Menu.Item
            leftSection={<Icon name="unpublish" />}
            onClick={() => onAction("unpublish")}
          >
            {t`Unpublish`}
          </Menu.Item>
        )}
        {canChangePublishing && <Menu.Divider />}
        <Menu.Item
          leftSection={<Icon name="sync" />}
          onClick={handleSyncSchema}
        >
          {t`Re-sync schema`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="list" />} onClick={handleRescan}>
          {t`Re-scan field values`}
        </Menu.Item>
        <Menu.Item leftSection={<Icon name="trash" />} onClick={handleDiscard}>
          {t`Discard cached field values`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * The tables the selection covers: selected tables plus every table in the
 * selected schemas and databases. Their current values come from this list,
 * which refetches after each bulk or per-table update.
 */
function useBulkTargetTables(): Table[] {
  const { selectedDatabases, selectedSchemas, selectedTables } = useSelection();
  const { data: tables = [] } = useListTablesQuery();

  return useMemo(
    () =>
      tables.filter(
        (table) =>
          selectedTables.has(table.id) ||
          selectedDatabases.has(table.db_id) ||
          selectedSchemas.has(`${table.db_id}:${table.schema}`),
      ),
    [tables, selectedDatabases, selectedSchemas, selectedTables],
  );
}

/**
 * What the tables have for one property: the value they all share, or
 * `null` with `isMixed` when they differ. `null` without `isMixed` means
 * none of them has a value.
 */
type BulkValue<T> = { value: T | null; isMixed: boolean };

function getBulkValue<T>(
  values: (T | null | undefined)[],
  getKey: (value: T) => string = String,
): BulkValue<T> {
  const keys = values.map((value) => (value == null ? null : getKey(value)));
  const isShared = keys.every((key) => key === keys[0]);
  return isShared
    ? { value: values[0] ?? null, isMixed: false }
    : { value: null, isMixed: true };
}

/** "Mixed" when tables differ; otherwise the property's empty state */
function getBulkPlaceholder(
  bulkValue: BulkValue<unknown>,
  emptyPlaceholder: string,
) {
  return bulkValue.isMixed ? t`Mixed` : emptyPlaceholder;
}

/** The description, written to each table since there's no bulk update for it */
function BulkMetadataSection({ tables }: { tables: Table[] }) {
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const description = getBulkValue(
    tables.map((table) => table.description || null),
  );

  const handleDescriptionChange = async (value: string) => {
    const description = value.trim() || null;
    const results = await Promise.all(
      tables.map((table) => updateTable({ id: table.id, description })),
    );
    if (results.some((result) => result.error)) {
      sendErrorToast(t`Failed to update descriptions`);
    } else {
      sendSuccessToast(t`Descriptions updated`);
    }
  };

  return (
    <SidebarSection title={t`Metadata`}>
      <DetailsTable>
        <DetailsRow
          label={t`Description`}
          fillValue
          value={
            <DetailsEditableText
              // Starts over when the tables' shared description changes
              key={description.value ?? ""}
              initialValue={description.value ?? ""}
              placeholder={getBulkPlaceholder(description, t`No description`)}
              isMultiline
              isOptional
              onChange={handleDescriptionChange}
              data-testid="bulk-table-description-input"
            />
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
}

type AttributeChanges = {
  dataSource?: TableDataSource | "unknown" | null;
  email?: string | null;
  entityType?: string | null;
  userId?: UserId | "unknown" | null;
};

type Owner = { userId: UserId | null; email: string | null };

function getTableOwner(table: Table): Owner | null {
  if (table.owner_user_id != null) {
    return { userId: table.owner_user_id, email: null };
  }
  return table.owner_email ? { userId: null, email: table.owner_email } : null;
}

/** Attributes with a bulk API, plus the mocked data layer */
function BulkAttributesSection({
  tables,
  onUpdate,
}: {
  tables: Table[];
  onUpdate: () => void;
}) {
  const { selectedDatabases, selectedSchemas, selectedTables } = useSelection();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [editTables] = useEditTablesMutation();
  const owner = getBulkValue(
    tables.map(getTableOwner),
    ({ userId, email }) => `${userId}:${email}`,
  );
  const entityType = getBulkValue(tables.map((table) => table.entity_type));
  const dataSource = getBulkValue(tables.map((table) => table.data_source));

  const handleSubmit = async (changes: AttributeChanges) => {
    const { dataSource, email, entityType, userId } = changes;
    const { error } = await editTables({
      table_ids: Array.from(selectedTables),
      schema_ids: Array.from(selectedSchemas),
      database_ids: Array.from(selectedDatabases),
      entity_type: entityType ?? undefined,
      data_source: dataSource === "unknown" ? null : (dataSource ?? undefined),
      owner_email:
        userId === "unknown" || typeof userId === "number"
          ? null
          : (email ?? undefined),
      owner_user_id: userId === "unknown" ? null : (userId ?? undefined),
    });

    const result = error ? "failure" : "success";
    if (email !== undefined || userId !== undefined) {
      trackDataStudioBulkAttributeUpdated("owner", result);
    }
    if (entityType !== undefined) {
      trackDataStudioBulkAttributeUpdated("entity_type", result);
    }
    if (dataSource !== undefined) {
      trackDataStudioBulkAttributeUpdated("data_source", result);
    }

    if (error) {
      sendErrorToast(t`Failed to update items`);
    } else {
      sendSuccessToast(t`Items updated`);
    }
    onUpdate();
  };

  return (
    <SidebarSection title={t`Attributes`}>
      <DetailsTable>
        <DetailsRow
          label={t`Owner`}
          fillValue
          value={
            <UserInput
              email={owner.value?.email ?? null}
              userId={owner.value?.userId ?? null}
              label={undefined}
              aria-label={t`Owner`}
              placeholder={getBulkPlaceholder(owner, t`No owner`)}
              classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
              onEmailChange={(email) => handleSubmit({ email })}
              onUserIdChange={(userId) => handleSubmit({ userId })}
            />
          }
        />
        <BulkDataLayerRow tables={tables} />
        <DetailsRow
          label={t`Entity type`}
          fillValue
          value={
            <EntityTypeInput
              value={entityType.value}
              label={undefined}
              aria-label={t`Entity type`}
              placeholder={getBulkPlaceholder(
                entityType,
                t`Select entity type`,
              )}
              classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
              onChange={(entityType) => handleSubmit({ entityType })}
            />
          }
        />
        {/* A transform-built table's source is fixed, as in its own drawer */}
        {tables.some((table) => table.data_source !== "metabase-transform") && (
          <DetailsRow
            label={t`Source`}
            fillValue
            value={
              <DataSourceInput
                value={dataSource.value}
                label={undefined}
                aria-label={t`Source`}
                placeholder={getBulkPlaceholder(
                  dataSource,
                  t`Select a data source`,
                )}
                classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                onChange={(dataSource) => handleSubmit({ dataSource })}
              />
            }
          />
        )}
      </DetailsTable>
    </SidebarSection>
  );
}

// Select value for "no override": each table uses its schema's layer
const SCHEMA_LAYER_VALUE = "schema-layer";

/**
 * PROTOTYPE: mocked, like a single table's data layer. Layers belong to a
 * database, so a layer is offered when every database involved has one with
 * that name, and each table gets its own database's layer.
 */
function BulkDataLayerRow({ tables }: { tables: Table[] }) {
  const { getDataLayers, getTableDataLayer, setTableDataLayerId } =
    useDataLayers();
  const layerNames = getSharedLayerNames(tables, getDataLayers);
  // A table without an override uses its schema's layer, so it's never unset
  const layer = getBulkValue(
    tables.map((table) => {
      const { layer, isInherited } = getTableDataLayer(
        table.db_id,
        table.schema,
        table.id,
      );
      return isInherited ? SCHEMA_LAYER_VALUE : (layer?.name ?? null);
    }),
  );

  const handleChange = (value: string | null) => {
    if (value == null) {
      return;
    }
    tables.forEach((table) => {
      const layer = getDataLayers(table.db_id).find(
        (layer) => layer.name === value,
      );
      if (value === SCHEMA_LAYER_VALUE) {
        setTableDataLayerId(table.db_id, table.id, null);
      } else if (layer) {
        setTableDataLayerId(table.db_id, table.id, layer.id);
      }
    });
  };

  return (
    <DetailsRow
      label={t`Data layer`}
      fillValue
      value={
        <Select
          aria-label={t`Data layer`}
          classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
          data={[
            { value: SCHEMA_LAYER_VALUE, label: t`Each schema's layer` },
            ...layerNames.map((name) => ({ value: name, label: name })),
          ]}
          value={layer.value}
          placeholder={getBulkPlaceholder(layer, t`Choose a layer`)}
          allowDeselect={false}
          onChange={handleChange}
          data-testid="bulk-table-data-layer-input"
        />
      }
    />
  );
}

/** Names of the layers every database involved has, in the first one's order */
function getSharedLayerNames(
  tables: Table[],
  getDataLayers: (databaseId: DatabaseId) => DataLayer[],
): string[] {
  const databaseIds = Array.from(new Set(tables.map((table) => table.db_id)));
  const [first = [], ...rest] = databaseIds.map((databaseId) =>
    getDataLayers(databaseId).map(({ name }) => name),
  );
  return first.filter((name) => rest.every((names) => names.includes(name)));
}

/** PROTOTYPE: mocked, like a single table's structure. Set table by table. */
function BulkStructureSection({ tables }: { tables: Table[] }) {
  const {
    getTableStructure,
    setTableRole,
    setGrainDescription,
    setPeriodGranularity,
  } = useTableStructures();
  // Roles are inferred from fields, which table lists come without
  const { tables: tablesWithFields } = useTablesWithFields(tables, {
    isEnabled: true,
  });
  const structures = tablesWithFields.map((table) => getTableStructure(table));
  const role = getBulkValue(structures.map((structure) => structure.role));
  const grainDescription = getBulkValue(
    structures.map((structure) => structure.grainDescription || null),
  );
  // Period only means something for periodic snapshot tables; setting a
  // role here can add or remove some
  const periodicTables = tablesWithFields.filter((_table, index) => {
    const { role } = structures[index];
    return role != null && isRoleA(role, "role/PeriodicSnapshotFact");
  });
  const periodGranularity = getBulkValue(
    periodicTables.map((table) => getTableStructure(table).periodGranularity),
  );

  const handleRoleChange = (value: string | null) => {
    if (isTableRole(value)) {
      tables.forEach((table) => setTableRole(table, value));
    }
  };

  const handlePeriodChange = (value: string | null) => {
    const option = getPeriodGranularityOptions().find(
      (option) => option.value === value,
    );
    if (option) {
      periodicTables.forEach((table) =>
        setPeriodGranularity(table, option.value),
      );
    }
  };

  return (
    <SidebarSection title={t`Structure`}>
      <DetailsTable>
        <DetailsRow
          label={t`Role`}
          fillValue
          value={
            <Select
              aria-label={t`Role`}
              classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
              data={getTableRoleOptions()}
              value={role.value}
              placeholder={getBulkPlaceholder(role, t`Choose a role`)}
              searchable
              allowDeselect={false}
              onChange={handleRoleChange}
              data-testid="bulk-table-role-select"
            />
          }
        />
        <DetailsRow
          label={t`Each row is`}
          fillValue
          value={
            <DetailsEditableText
              // Starts over when the tables' shared description changes
              key={grainDescription.value ?? ""}
              initialValue={grainDescription.value ?? ""}
              placeholder={getBulkPlaceholder(
                grainDescription,
                t`Describe one row`,
              )}
              isMultiline
              isOptional
              onChange={(value) =>
                tables.forEach((table) =>
                  setGrainDescription(table, value.trim()),
                )
              }
              data-testid="bulk-table-grain-description-input"
            />
          }
        />
        {periodicTables.length > 0 && (
          <DetailsRow
            label={t`Period`}
            fillValue
            value={
              <Select
                aria-label={t`Period`}
                classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
                data={getPeriodGranularityOptions()}
                value={periodGranularity.value}
                placeholder={getBulkPlaceholder(
                  periodGranularity,
                  t`Choose a period`,
                )}
                allowDeselect={false}
                onChange={handlePeriodChange}
              />
            }
          />
        )}
      </DetailsTable>
    </SidebarSection>
  );
}
