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

import { SemanticReviewButton } from "../SemanticReview";

import { MeasureList } from "./MeasureList";
import { SegmentList } from "./SegmentList";
import { TableAttributesEditSingle } from "./TableAttributesEditSingle";
import { TableCollection } from "./TableCollection";
import { TableFieldsTab } from "./TableFieldsTab";
import { TableFiltering } from "./TableFiltering";
import { TableMetadata, TableStats } from "./TableMetadata";
import { TableProcess, useHasProcess } from "./TableProcess";
import { TablePropertyList } from "./TablePropertyList";
import {
  TableHistorySection,
  TableStructure,
  useIsHistoryTable,
} from "./TableStructure";

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
  const { handleNameChange, handleDescriptionChange } = useTableUpdateHandlers({
    table,
    onNameUpdated: onUpdate,
  });
  const readOnly = !table.can_write;
  const structure = useTableStructures().getTableStructure(table);
  const isCustomPropertyTable =
    structure.role != null &&
    isRoleA(structure.role, "role/CustomPropertyTable");
  const isHistoryTable = useIsHistoryTable(table);
  const hasProcess = useHasProcess(table);
  // A link to the Process tab of a table without one lands on Details
  const isMissingTab =
    (activeTab === "process" && !hasProcess) ||
    (activeTab === "history" && !isHistoryTable);
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

              <TableAttributesEditSingle table={table} onUpdate={onUpdate} />

              <TableStructure table={table} readOnly={readOnly} />

              <TableFiltering table={table} readOnly={readOnly} />

              {table.is_published && <TableCollection table={table} />}

              <TableStats table={table} />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="field">
            <TableFieldsTab
              table={table}
              activeFieldId={activeFieldId}
              getFieldHref={getFieldHref}
              actions={!readOnly && <SemanticReviewButton table={table} />}
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
