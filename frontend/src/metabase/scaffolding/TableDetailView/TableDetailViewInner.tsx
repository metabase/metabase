import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { push } from "react-router-redux";
import { useMount } from "react-use";
import { t } from "ttag";

import { useUpdateTableComponentSettingsMutation } from "metabase/api/table";
import { useDispatch } from "metabase/lib/redux";
import { question } from "metabase/lib/urls";
import { closeNavbar } from "metabase/redux/app";
import { Box, Flex, Group, Stack, Text, Tooltip } from "metabase/ui/components";
import { Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import { Relationships } from "metabase/visualizations/components/ObjectDetail/ObjectRelationships";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import { isEntityName, isPK } from "metabase-lib/v1/types/utils/isa";
import type { Dataset, DatasetColumn } from "metabase-types/api";

import { getDefaultObjectViewSettings } from "../utils";

import { DetailViewHeader } from "./DetailViewHeader";
import { DetailViewSidebar } from "./DetailViewSidebar";
import { SortableSection } from "./SortableSection";
import { useDetailViewSections } from "./use-detail-view-sections";
import { useForeignKeyReferences } from "./use-foreign-key-references";

interface TableDetailViewProps {
  tableId: number;
  rowId: number;
  dataset: Dataset;
  table: any;
  tableForeignKeys: any[];
  isEdit: boolean;
}

const emptyColumns: DatasetColumn[] = [];
const defaultRow = {};
export function TableDetailViewInner({
  tableId,
  rowId,
  dataset,
  table,
  tableForeignKeys,
  isEdit = false,
}: TableDetailViewProps) {
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const dispatch = useDispatch();
  const [updateTableComponentSettings] =
    useUpdateTableComponentSettingsMutation();

  const columns = dataset?.data?.results_metadata?.columns ?? emptyColumns;

  const rows = useMemo(() => dataset?.data?.rows || [], [dataset]);
  const row = rows[currentRowIndex] || defaultRow;

  const { tableForeignKeyReferences } = useForeignKeyReferences({
    tableForeignKeys,
    row,
    columns,
    tableDatabaseId: table.database_id,
  });

  const defaultSections = useMemo(
    () => getDefaultObjectViewSettings(table).sections,
    [table],
  );

  const initialSections = useMemo(() => {
    const savedSettingsSections =
      table?.component_settings?.object_view?.sections;

    return savedSettingsSections && savedSettingsSections.length > 0
      ? savedSettingsSections
      : defaultSections;
  }, [table?.component_settings?.object_view?.sections, defaultSections]);

  const {
    sections,
    createSection,
    updateSection,
    removeSection,
    handleDragEnd,
  } = useDetailViewSections(initialSections);

  const notEmptySections = isEdit
    ? sections
    : sections.filter((section) => section.fields.length > 0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleEditClick = useCallback(() => {
    dispatch(push(`/table/${tableId}/detail/${rowId}/edit`));
  }, [tableId, rowId, dispatch]);

  const handleCloseClick = useCallback(() => {
    dispatch(push(`/table/${tableId}/detail/${rowId}`));
  }, [tableId, rowId, dispatch]);

  const handleSaveClick = useCallback(async () => {
    try {
      await updateTableComponentSettings({
        id: tableId,
        component_settings: {
          ...(table?.component_settings ?? { list_view: {} }),
          object_view: {
            sections: sections,
          },
        },
      }).unwrap();

      dispatch(push(`/table/${tableId}/detail/${rowId}`));
    } catch (error) {
      console.error("Failed to save component settings:", error);
    }
  }, [
    updateTableComponentSettings,
    tableId,
    table?.component_settings,
    sections,
    dispatch,
    rowId,
  ]);

  // Handle foreign key navigation
  const handleFollowForeignKey = useCallback(
    (fk: ForeignKey) => {
      const pkIndex = columns.findIndex(isPK);
      if (pkIndex === -1) {
        return;
      }

      const objectId = row[pkIndex];
      if (objectId == null) {
        return;
      }

      // Navigate to a question with the foreign key filter
      if (fk.origin?.table_id) {
        // Create a card with the foreign key query
        const card = {
          type: "question" as const,
          dataset_query: {
            type: "query" as const,
            query: {
              "source-table": fk.origin.table_id,
              filter: ["=", ["field", fk.origin.id, null], objectId],
            },
            database: fk.origin.table?.db_id || table.database_id,
          },
        } as any;

        // Navigate to the question URL with the card as hash
        const questionUrl = question(card, { hash: card });
        dispatch(push(questionUrl));
      }
    },
    [row, columns, table.database_id, dispatch],
  );

  useMount(() => {
    dispatch(closeNavbar());
  });

  useEffect(() => {
    if (!rows.length) {
      return;
    }
    if (rowId !== undefined) {
      const idx = rows.findIndex((row) => String(row[0]) === String(rowId));
      setCurrentRowIndex(idx >= 0 ? idx : 0);
    } else {
      setCurrentRowIndex(0);
    }
  }, [rowId, rows]);

  const handleViewPreviousObjectDetail = useCallback(() => {
    setCurrentRowIndex((i) => {
      const newIndex = i - 1;
      const rowId = rows[newIndex]?.[0];
      if (rowId !== undefined) {
        dispatch(
          push(`/table/${tableId}/detail/${rowId}${isEdit ? "/edit" : ""}`),
        );
      }
      return newIndex;
    });
  }, [dispatch, rows, tableId, isEdit]);

  const handleViewNextObjectDetail = useCallback(() => {
    setCurrentRowIndex((i) => {
      const newIndex = i + 1;
      const rowId = rows[newIndex]?.[0];
      if (rowId !== undefined) {
        dispatch(
          push(`/table/${tableId}/detail/${rowId}${isEdit ? "/edit" : ""}`),
        );
      }
      return newIndex;
    });
  }, [dispatch, rows, tableId, isEdit]);

  const nameIndex = columns.findIndex(isEntityName);
  const rowName = nameIndex == null ? null : row[nameIndex];

  // Check if we have relationships to show
  const hasRelationships = tableForeignKeys.length > 0; // TODO: this crashes

  const DetailContainer = ({ children }: { children: ReactNode }) => (
    <Stack
      gap="xl"
      flex="1"
      miw={0}
      h="100%"
      style={{
        overflow: "auto",
      }}
    >
      <DetailViewHeader
        rowId={rowId}
        rowName={rowName}
        table={table}
        isEdit={isEdit}
        canOpenPreviousItem={rows.length > 1 && currentRowIndex > 0}
        canOpenNextItem={rows.length > 1 && currentRowIndex < rows.length - 1}
        onEditClick={handleEditClick}
        onPreviousItemClick={handleViewPreviousObjectDetail}
        onNextItemClick={handleViewNextObjectDetail}
        onCloseClick={handleCloseClick}
        onSaveClick={handleSaveClick}
      />

      <Group
        align="flex-start"
        gap={0}
        mih={0}
        wrap="nowrap"
        h="100%"
        style={{
          borderTop: "1px solid var(--border-color)",
        }}
      >
        {hasRelationships && (
          <Box
            bg="bg-white"
            flex="0 0 auto"
            mih={0}
            miw={300}
            h="100%"
            p="lg"
            style={{
              borderRight: `1px solid var(--mb-color-border)`,
              overflowY: "auto",
            }}
          >
            <Text fw={600} size="lg" mb="md">{t`Relationships`}</Text>
            <Relationships
              objectName={rowName ? String(rowName) : String(rowId)}
              tableForeignKeys={tableForeignKeys as any}
              tableForeignKeyReferences={tableForeignKeyReferences}
              foreignKeyClicked={handleFollowForeignKey}
              bg="bg-white"
              p="xs"
            />
          </Box>
        )}

        <Stack
          align="center"
          bg="bg-white"
          h="100%"
          flex="1"
          p="xl"
          style={{ overflow: "auto" }}
        >
          <Box maw={800} w="100%">
            {children}
          </Box>
        </Stack>

        {isEdit && (
          <Box
            bg="white"
            flex="0 0 auto"
            mih={0}
            miw={400}
            h="100%"
            p="lg"
            style={{
              borderLeft: `1px solid var(--mb-color-border)`,
              overflowY: "auto",
            }}
          >
            <Text
              fw={600}
              size="lg"
              mb="xs"
              pb="sm"
            >{t`Detail view settings`}</Text>

            <DetailViewSidebar
              columns={columns}
              sections={sections}
              onCreateSection={createSection}
              onUpdateSection={updateSection}
              onRemoveSection={removeSection}
              onDragEnd={handleDragEnd}
            />
          </Box>
        )}
      </Group>
    </Stack>
  );

  return (
    <DetailContainer>
      <Stack gap="md" mt={"md"} mb={"sm"}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={notEmptySections.map((section) => section.id)}
            strategy={verticalListSortingStrategy}
          >
            {notEmptySections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                columns={columns}
                row={row}
                tableId={tableId}
                isEdit={isEdit}
                onUpdateSection={(update) => updateSection(section.id, update)}
                onRemoveSection={
                  notEmptySections.length > 1
                    ? () => removeSection(section.id)
                    : undefined
                }
              />
            ))}
          </SortableContext>
        </DndContext>
      </Stack>

      {isEdit && (
        <Flex align="center" justify="center" w="100%" mt="md">
          <Tooltip label={t`Add section`}>
            <Button leftSection={<Icon name="add" />} onClick={createSection} />
          </Tooltip>
        </Flex>
      )}
    </DetailContainer>
  );
}
