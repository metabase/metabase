import { memo, useCallback, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { FieldOrderPicker } from "metabase/metadata/components";
import { ResponsiveButton } from "metabase/metadata/components/ResponsiveButton";
import { TableFieldList } from "metabase/metadata/components/TableFieldList";
import { TableSortableFieldList } from "metabase/metadata/components/TableSortableFieldList";
import { useTableUpdateHandlers } from "metabase/metadata/hooks";
import { useNavigate } from "metabase/router";
import { Box, Group, Loader, Stack, Tabs } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { DataStudioTableMetadataTab } from "metabase/urls/data-studio";
import type { FieldId, Table } from "metabase-types/api";

import { MeasureList } from "./MeasureList";
import { SegmentList } from "./SegmentList";
import { TableAttributesEditSingle } from "./TableAttributesEditSingle";
import { TableCollection } from "./TableCollection";
import { TableMetadata } from "./TableMetadata";
import S from "./TableSection.module.css";

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
      <Box>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tabs.List mb="xl">
            <Tabs.Tab value="details">{t`Details`}</Tabs.Tab>
            <Tabs.Tab value="field">{t`Fields`}</Tabs.Tab>
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

              {table.is_published && <TableCollection table={table} />}
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

export const TableSection = memo(TableSectionBase);
