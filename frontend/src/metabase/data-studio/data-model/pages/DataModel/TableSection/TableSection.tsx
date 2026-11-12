import { memo, useCallback } from "react";
import { t } from "ttag";

import { useTableUpdateHandlers } from "metabase/metadata/hooks";
import {
  isRoleA,
  usePropertyRegistry,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { useNavigate } from "metabase/router";
import { Box, Stack, Tabs } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataStudioTableMetadataTab } from "metabase/urls/data-studio";
import type { FieldId, Table } from "metabase-types/api";

import { SimpleMeasureList } from "./MeasureList";
import { SimpleSegmentList } from "./SegmentList";
import { TableAttributesEditSingle } from "./TableAttributesEditSingle";
import { TableCollection } from "./TableCollection";
import { TableFieldsTab } from "./TableFieldsTab";
import { TableMetadata, TableStats } from "./TableMetadata";
import { TableProcess, useHasProcess } from "./TableProcess";
import { TablePropertyList } from "./TablePropertyList";
import {
  TableHistorySection,
  TableStructure,
  useShowsHistoryTab,
} from "./TableStructure";

interface Props {
  table: Table;
  activeFieldId?: FieldId;
  activeTab: DataStudioTableMetadataTab;
  onUpdate: () => void;
}

// PROTOTYPE: process milestones are parked; flip to bring the tab back
const IS_PROCESS_TAB_SHOWN = false;

const TableSectionBase = ({
  table,
  activeFieldId,
  activeTab,
  onUpdate,
}: Props) => {
  const { handleNameChange, handleDescriptionChange } = useTableUpdateHandlers({
    table,
    onNameUpdated: onUpdate,
  });
  const readOnly = !table.can_write;
  const structure = useTableStructures().getTableStructure(table);
  const isCustomPropertyTable =
    structure.role != null &&
    isRoleA(structure.role, "role/CustomPropertyTable");
  const isHistoryTable = useShowsHistoryTab(table);
  const hasProcess = useHasProcess(table) && IS_PROCESS_TAB_SHOWN;
  // Segments and measures belong to the semantic layer now: Connected data
  // only lists the ones a table already has, for viewing and editing
  const hasSegments = (table.segments?.length ?? 0) > 0;
  const hasMeasures = (table.measures?.length ?? 0) > 0;
  // A link to a tab the table doesn't show lands on Details
  const isMissingTab =
    (activeTab === "process" && !hasProcess) ||
    (activeTab === "history" && !isHistoryTable) ||
    (activeTab === "segments" && !hasSegments) ||
    (activeTab === "measures" && !hasMeasures);
  const visibleTab = isMissingTab ? "details" : activeTab;

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
        <Tabs value={visibleTab} onChange={handleTabChange}>
          {/* Bleeds into the panel's padding so the border spans the drawer */}
          <Tabs.List mb="xl" mx="-xl" px="xl">
            <Tabs.Tab value="details">{t`Details`}</Tabs.Tab>
            <Tabs.Tab value="field">{t`Fields`}</Tabs.Tab>
            {isCustomPropertyTable && (
              <Tabs.Tab value="properties">{t`Custom properties`}</Tabs.Tab>
            )}
            {isHistoryTable && (
              <Tabs.Tab value="history">{t`History`}</Tabs.Tab>
            )}
            {hasProcess && <Tabs.Tab value="process">{t`Process`}</Tabs.Tab>}
            {hasSegments && <Tabs.Tab value="segments">{t`Segments`}</Tabs.Tab>}
            {hasMeasures && <Tabs.Tab value="measures">{t`Measures`}</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel value="details">
            <Stack gap="xxl">
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
            <TableFieldsTab
              table={table}
              activeFieldId={activeFieldId}
              getFieldHref={getFieldHref}
            />
          </Tabs.Panel>

          {isCustomPropertyTable && (
            <Tabs.Panel value="properties">
              <TablePropertyList table={table} />
            </Tabs.Panel>
          )}

          {isHistoryTable && (
            <Tabs.Panel value="history">
              <TableHistorySection table={table} readOnly={readOnly} />
            </Tabs.Panel>
          )}

          {hasProcess && (
            <Tabs.Panel value="process">
              <TableProcess table={table} readOnly={readOnly} />
            </Tabs.Panel>
          )}

          {hasSegments && (
            <Tabs.Panel value="segments">
              <SimpleSegmentList table={table} />
            </Tabs.Panel>
          )}

          {hasMeasures && (
            <Tabs.Panel value="measures">
              <SimpleMeasureList table={table} />
            </Tabs.Panel>
          )}
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
