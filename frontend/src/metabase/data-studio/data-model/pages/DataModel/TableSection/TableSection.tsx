import { memo, useCallback, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { trackDependencyEntitySelected } from "metabase/common/data-studio/analytics";
import { FieldOrderPicker } from "metabase/metadata/components";
import { ResponsiveButton } from "metabase/metadata/components/ResponsiveButton";
import { TableFieldList } from "metabase/metadata/components/TableFieldList";
import { TableSortableFieldList } from "metabase/metadata/components/TableSortableFieldList";
import { useTableUpdateHandlers } from "metabase/metadata/hooks";
import {
  isRoleA,
  usePropertyRegistry,
  useTableStructures,
} from "metabase/metadata/table-structure";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_LIBRARY,
  PLUGIN_REMOTE_SYNC,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import {
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Tabs,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataStudioTableMetadataTab } from "metabase/urls/data-studio";
import { dependencyGraph } from "metabase/urls/dependencies";
import type { FieldId, Table } from "metabase-types/api";

import { MeasureList } from "./MeasureList";
import { SegmentList } from "./SegmentList";
import { TableActionsMenu } from "./TableActionsMenu";
import { TableAttributesEditSingle } from "./TableAttributesEditSingle";
import { TableCollection } from "./TableCollection";
import { TableMetadata, TableStats } from "./TableMetadata";
import { TablePropertyList } from "./TablePropertyList";
import S from "./TableSection.module.css";
import { TableStructure } from "./TableStructure";

interface Props {
  table: Table;
  activeFieldId?: FieldId;
  activeTab: DataStudioTableMetadataTab;
  canPublish: boolean;
  hasLibrary: boolean;
  onUpdate: () => void;
}

type TableModalType = "library" | "publish" | "unpublish";

const TableSectionBase = ({
  table,
  activeFieldId,
  activeTab,
  canPublish,
  hasLibrary,
  onUpdate,
}: Props) => {
  const {
    handleNameChange,
    handleDescriptionChange,
    handleFieldOrderTypeChange,
    handleCustomFieldOrderChange,
    isUpdatingSorting,
  } = useTableUpdateHandlers({ table, onNameUpdated: onUpdate });
  const [modalType, setModalType] = useState<TableModalType>();
  const [isSorting, setIsSorting] = useState(false);
  const hasFields = Boolean(table.fields && table.fields.length > 0);
  const readOnly = !table.can_write;
  const isLibraryEnabled = PLUGIN_LIBRARY.isEnabled;
  const isDependencyGraphEnabled = PLUGIN_DEPENDENCIES.isEnabled;
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const structure = useTableStructures().getTableStructure(table);
  const isCustomPropertyTable =
    structure.role != null &&
    isRoleA(structure.role, "role/CustomPropertyTable");
  // History pages link to the "history" tab, which lands on Details
  const visibleTab = activeTab === "history" ? "details" : activeTab;

  const getFieldHref = (fieldId: FieldId) => {
    return Urls.dataStudioData({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      tab: "field",
      fieldId,
    });
  };

  const navigate = useNavigate();

  const handleTabChange = useCallback(
    (tab: DataStudioTableMetadataTab | null) => {
      if (tab == null) {
        return;
      }

      navigate(
        Urls.dataStudioData({
          databaseId: table.db_id,
          schemaName: table.schema,
          tableId: table.id,
          tab,
        }),
      );
    },
    [table.db_id, table.schema, table.id, navigate],
  );

  const handlePublishToggle = () => {
    if (!hasLibrary) {
      setModalType("library");
    } else {
      setModalType(table.is_published ? "unpublish" : "publish");
    }
  };

  const handleCloseModal = () => {
    setModalType(undefined);
  };

  const handleSuccessCloseModal = () => {
    onUpdate();
    handleCloseModal();
  };

  const registerDependencyGraphTrackingEvent = () => {
    trackDependencyEntitySelected({
      entityId: table.id,
      triggeredFrom: "data-structure",
      eventDetail: "table",
    });
  };

  return (
    <Stack data-testid="table-section" gap="lg" pb="xxl">
      {isCustomPropertyTable && <KeepPropertyRegistryLoaded table={table} />}
      <Box>
        <Tabs value={visibleTab} onChange={handleTabChange}>
          <Tabs.List mb="lg">
            <Tabs.Tab value="details">{t`Details`}</Tabs.Tab>
            <Tabs.Tab value="field">{t`Fields`}</Tabs.Tab>
            {isCustomPropertyTable && (
              <Tabs.Tab value="properties">{t`Custom properties`}</Tabs.Tab>
            )}
            <Tabs.Tab value="segments">{t`Segments`}</Tabs.Tab>
            <Tabs.Tab value="measures">{t`Measures`}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="details">
            <Stack gap="xxl">
              <Group justify="stretch" gap="sm">
                {canPublish && isLibraryEnabled && !remoteSyncReadOnly && (
                  <Button
                    flex="1"
                    variant={table.is_published ? "default" : "filled"}
                    leftSection={
                      <Icon
                        name={table.is_published ? "unpublish" : "publish"}
                      />
                    }
                    onClick={handlePublishToggle}
                  >
                    {table.is_published ? t`Unpublish` : t`Publish`}
                  </Button>
                )}

                {isDependencyGraphEnabled && (
                  <Tooltip label={t`Dependency graph`}>
                    <Button
                      component={ForwardRefLink}
                      to={dependencyGraph({
                        entry: { id: Number(table.id), type: "table" },
                      })}
                      flex="0 1 auto"
                      leftSection={<Icon name="dependencies" />}
                      aria-label={t`Dependency graph`}
                      onClickCapture={registerDependencyGraphTrackingEvent}
                      onAuxClick={registerDependencyGraphTrackingEvent}
                    />
                  </Tooltip>
                )}

                <Box style={{ flexGrow: 0 }}>
                  <TableLink table={table} />
                </Box>
                <TableActionsMenu table={table} />
              </Group>

              <TableMetadata
                table={table}
                readOnly={readOnly}
                onNameChange={handleNameChange}
                onDescriptionChange={handleDescriptionChange}
              />

              <TableAttributesEditSingle table={table} onUpdate={onUpdate} />

              <TableStructure table={table} readOnly={readOnly} />

              {table.is_published && <TableCollection table={table} />}

              <TableStats table={table} />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="field">
            <Stack gap="lg">
              <Group gap="lg" justify="flex-start" wrap="nowrap">
                {!isSorting && hasFields && !readOnly && (
                  <ResponsiveButton
                    icon="sort_arrows"
                    showLabel
                    onClick={() => setIsSorting(true)}
                  >{t`Sorting`}</ResponsiveButton>
                )}

                {isSorting && (
                  <FieldOrderPicker
                    value={table.field_order}
                    onChange={handleFieldOrderTypeChange}
                  />
                )}

                {isSorting && (
                  <ResponsiveButton
                    icon="check"
                    showLabel
                    onClick={() => setIsSorting(false)}
                  >{t`Done`}</ResponsiveButton>
                )}

                {isUpdatingSorting && <Loader size="xs" />}
              </Group>

              {!hasFields && (
                <EmptyState
                  className={S.EmptyState}
                  message={t`This table has no fields`}
                  spacing="sm"
                />
              )}

              {hasFields && (
                <>
                  <Box
                    style={{
                      display: isSorting ? "block" : "none",
                    }}
                    aria-hidden={!isSorting}
                  >
                    <TableSortableFieldList
                      activeFieldId={activeFieldId}
                      table={table}
                      onChange={handleCustomFieldOrderChange}
                    />
                  </Box>

                  <Box
                    style={{
                      display: isSorting ? "none" : "block",
                    }}
                    aria-hidden={isSorting}
                  >
                    <TableFieldList
                      table={table}
                      activeFieldId={activeFieldId}
                      getFieldHref={getFieldHref}
                    />
                  </Box>
                </>
              )}
            </Stack>
          </Tabs.Panel>

          {isCustomPropertyTable && (
            <Tabs.Panel value="properties">
              <TablePropertyList table={table} />
            </Tabs.Panel>
          )}

          <Tabs.Panel value="segments">
            <SegmentList table={table} />
          </Tabs.Panel>

          <Tabs.Panel value="measures">
            <MeasureList table={table} />
          </Tabs.Panel>
        </Tabs>
      </Box>

      <PLUGIN_LIBRARY.CreateLibraryModal
        title={t`First, let's create your semantic layer`}
        explanatorySentence={t`This is where published tables will go.`}
        isOpened={modalType === "library"}
        onCreate={() => setModalType("publish")}
        onClose={handleCloseModal}
      />
      <PLUGIN_LIBRARY.PublishTablesModal
        isOpened={modalType === "publish"}
        tableIds={[table.id]}
        onPublish={handleSuccessCloseModal}
        onClose={handleCloseModal}
      />
      <PLUGIN_LIBRARY.UnpublishTablesModal
        isOpened={modalType === "unpublish"}
        tableIds={[table.id]}
        onUnpublish={handleSuccessCloseModal}
        onClose={handleCloseModal}
      />
    </Stack>
  );
};

function TableLink({ table }: { table: Table }) {
  const url =
    Urls.modelToUrl({
      id: Number(table.id),
      name: table.name,
      model: "table",
      database: { id: table.db_id },
    }) ?? "#";

  return (
    <Tooltip label={t`Go to this table`} position="top">
      <Button
        component={ForwardRefLink}
        to={url}
        aria-label={t`Go to this table`}
        leftSection={<Icon name="external" size={16} />}
      />
    </Tooltip>
  );
}

// Ad-hoc query results are dropped as soon as nothing reads them, so the
// Properties tab would re-profile on every visit. Reading the registry here,
// where it outlives tab switches, keeps it loaded while the table is open.
function KeepPropertyRegistryLoaded({ table }: { table: Table }) {
  usePropertyRegistry(table);
  return null;
}

export const TableSection = memo(TableSectionBase);
