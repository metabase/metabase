import { memo, useCallback, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
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
import { useNavigate } from "metabase/router";
import { Box, Group, Loader, Stack, Tabs } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataStudioTableMetadataTab } from "metabase/urls/data-studio";
import type { FieldId, Table } from "metabase-types/api";

import { MeasureList } from "./MeasureList";
import { SegmentList } from "./SegmentList";
import { TableAttributesEditSingle } from "./TableAttributesEditSingle";
import { TableCollection } from "./TableCollection";
import { TableHistoryVersions } from "./TableHistory";
import { TableMetadata, TableStats } from "./TableMetadata";
import { TablePropertyList } from "./TablePropertyList";
import S from "./TableSection.module.css";
import { TableStructure } from "./TableStructure";

interface Props {
  table: Table;
  activeFieldId?: FieldId;
  activeTab: DataStudioTableMetadataTab;
  onUpdate: () => void;
}

const TableSectionBase = ({
  table,
  activeFieldId,
  activeTab,
  onUpdate,
}: Props) => {
  const {
    handleNameChange,
    handleDescriptionChange,
    handleFieldOrderTypeChange,
    handleCustomFieldOrderChange,
    isUpdatingSorting,
  } = useTableUpdateHandlers({ table, onNameUpdated: onUpdate });
  const [isSorting, setIsSorting] = useState(false);
  const hasFields = Boolean(table.fields && table.fields.length > 0);
  const readOnly = !table.can_write;
  const structure = useTableStructures().getTableStructure(table);
  const isCustomPropertyTable =
    structure.role != null &&
    isRoleA(structure.role, "role/CustomPropertyTable");
  const isHistoryTable =
    structure.role != null && isRoleA(structure.role, "role/HistoryDimension");

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
  return (
    <Stack data-testid="table-section" gap="lg">
      {isCustomPropertyTable && <KeepPropertyRegistryLoaded table={table} />}
      <Box>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tabs.List mb="xl">
            <Tabs.Tab value="details">{t`Details`}</Tabs.Tab>
            <Tabs.Tab value="field">{t`Fields`}</Tabs.Tab>
            {isCustomPropertyTable && (
              <Tabs.Tab value="properties">{t`Custom properties`}</Tabs.Tab>
            )}
            {isHistoryTable && (
              <Tabs.Tab value="versions">{t`Versions`}</Tabs.Tab>
            )}
            <Tabs.Tab value="segments">{t`Segments`}</Tabs.Tab>
            <Tabs.Tab value="measures">{t`Measures`}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="details">
            <Stack gap="xxl">
              <TableMetadata
                table={table}
                readOnly={readOnly}
                onNameChange={handleNameChange}
                onDescriptionChange={handleDescriptionChange}
              />

              <TableStructure table={table} readOnly={readOnly} />

              <TableAttributesEditSingle table={table} onUpdate={onUpdate} />

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
          {isHistoryTable && (
            <Tabs.Panel value="versions">
              <TableHistoryVersions table={table} readOnly={readOnly} />
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
    </Stack>
  );
};

// Ad-hoc query results are dropped as soon as nothing reads them, so the
// Properties tab would re-profile on every visit. Reading the registry here,
// where it outlives tab switches, keeps it loaded while the table is open.
function KeepPropertyRegistryLoaded({ table }: { table: Table }) {
  usePropertyRegistry(table);
  return null;
}

export const TableSection = memo(TableSectionBase);
