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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";

import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import { useGetTableQueryMetadataQuery } from "metabase/api/table";
import EditableText from "metabase/common/components/EditableText";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { formatValue } from "metabase/lib/formatting";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, Group, Stack, Text } from "metabase/ui/components";
import { Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import type {
  Dataset,
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
  StructuredDatasetQuery,
} from "metabase-types/api";

import { getTableQuery } from "../TableListView/utils";

import { DetailViewHeader } from "./DetailViewHeader";
import { DetailViewSidebar } from "./DetailViewSidebar";
import S from "./TableDetailView.module.css";
import { useDetailViewSections } from "./use-detail-view-sections";

interface TableDetailViewLoaderProps {
  params: {
    tableId: string;
    rowId: string;
  };
  isEdit?: boolean;
  isListView?: boolean;
}

export function TableDetailView({
  params,
  isEdit = false,
  isListView = false,
}: TableDetailViewLoaderProps) {
  const tableId = parseInt(params.tableId, 10);
  const rowId = parseInt(params.rowId, 10);

  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });

  const query = useMemo<StructuredDatasetQuery | undefined>(() => {
    return table ? getTableQuery(table) : undefined;
  }, [table]);

  const { data: dataset } = useGetAdhocQueryQuery(query ? query : skipToken);

  if (!table || !dataset) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <TableDetailViewInner
      tableId={tableId}
      rowId={rowId}
      dataset={dataset}
      table={table}
      isEdit={isEdit}
      isListView={isListView}
    />
  );
}

interface TableDetailViewProps {
  tableId: number;
  rowId: number;
  dataset: Dataset;
  table: any;
  isEdit: boolean;
  isListView?: boolean;
}

export function TableDetailViewInner({
  tableId,
  rowId,
  dataset,
  table,
  isEdit = false,
  isListView = false,
}: TableDetailViewProps) {
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const dispatch = useDispatch();

  const columns = dataset?.data?.results_metadata?.columns ?? [];
  const rows = useMemo(() => dataset?.data?.rows || [], [dataset]);
  const row = rows[currentRowIndex] || {};

  const {
    sections,
    createSection,
    updateSection,
    removeSection,
    handleDragEnd,
  } = useDetailViewSections([
    {
      id: 1,
      title: "Info",
      direction: "vertical",
      fields: columns.map((col) => ({
        field_id: col.id as number,
        style: "normal",
      })),
    },
  ]);

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

  return (
    <Flex>
      <Box m="auto" mt="md" w="70%">
        {!isListView && (
          <DetailViewHeader
            table={table}
            isEdit={isEdit}
            canOpenPreviousItem={rows.length > 1 && currentRowIndex > 0}
            canOpenNextItem={
              rows.length > 1 && currentRowIndex < rows.length - 1
            }
            onEditClick={handleEditClick}
            onPreviousItemClick={handleViewPreviousObjectDetail}
            onNextItemClick={handleViewNextObjectDetail}
            onCloseClick={handleCloseClick}
          />
        )}
        <Stack gap="md" mt="lg">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((section) => section.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  columns={columns}
                  row={row}
                  isEdit={isEdit}
                  onUpdateSection={(update) =>
                    updateSection(section.id, update)
                  }
                  onRemoveSection={() => removeSection(section.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </Stack>
        {isEdit && (
          <Flex align="center" justify="center" w="100%" mt="md">
            <Button leftSection={<Icon name="add" />} onClick={createSection} />
          </Flex>
        )}
      </Box>
      {isEdit && !isListView && (
        <DetailViewSidebar
          columns={columns}
          sections={sections}
          onUpdateSection={updateSection}
        />
      )}
    </Flex>
  );
}

type SortableSectionProps = {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  row: RowValues;
  isEdit: boolean;
  onUpdateSection: (section: Partial<ObjectViewSectionSettings>) => void;
  onRemoveSection: () => void;
};

function SortableSection(props: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ObjectViewSection
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

type ObjectViewSectionProps = {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  row: RowValues;
  isEdit: boolean;
  onUpdateSection: (section: Partial<ObjectViewSectionSettings>) => void;
  onRemoveSection: () => void;
  dragHandleProps?: any;
};

function ObjectViewSection({
  section,
  columns,
  row,
  isEdit,
  onUpdateSection,
  onRemoveSection,
  dragHandleProps,
}: ObjectViewSectionProps) {
  return (
    <Box
      className={S.ObjectViewSection}
      pos="relative"
      bg="bg-medium"
      px="md"
      py="sm"
      style={{ borderRadius: "var(--default-border-radius)" }}
    >
      <Group gap="xs">
        {isEdit && (
          <Icon
            name="grabber"
            style={{ cursor: "grab" }}
            role="button"
            tabIndex={0}
            {...dragHandleProps}
          />
        )}
        <EditableText
          initialValue={section.title}
          isDisabled={!isEdit}
          onChange={(title) => onUpdateSection({ title })}
          style={{ fontWeight: 700 }}
        />
      </Group>
      <Flex
        direction={section.direction === "vertical" ? "column" : "row"}
        gap="md"
        mt="sm"
        px="xs"
      >
        {section.fields.map(({ field_id, style }) => {
          const columnIndex = columns.findIndex(
            (column) => column.id === field_id,
          );
          const column = columns[columnIndex];
          if (!column) {
            return null;
          }
          const value = row[columnIndex];
          return (
            <Box key={field_id}>
              <Text c="text-dark" fw={600} size="sm">
                {column.display_name}
              </Text>
              <Text {...getStyleProps(style)}>{formatValue(value)}</Text>
            </Box>
          );
        })}
      </Flex>
      {isEdit && (
        <Group
          className={S.ObjectViewSectionActions}
          pos="absolute"
          bg="bg-white"
          style={{ borderRadius: "var(--default-border-radius)" }}
          top={-5}
          right={-5}
        >
          <Button
            size="compact-xs"
            leftSection={<Icon name="close" />}
            onClick={onRemoveSection}
          />
        </Group>
      )}
    </Box>
  );
}

function getStyleProps(style: "bold" | "dim" | "title" | "normal") {
  switch (style) {
    case "bold":
      return { fw: 700 };
    case "dim":
      return { color: "text-light" };
    case "title":
      return { size: "xl", fw: 700 };
    default:
      return {};
  }
}
