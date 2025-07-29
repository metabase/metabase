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
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import {
  useGetTableQueryMetadataQuery,
  useUpdateTableComponentSettingsMutation,
} from "metabase/api/table";
import EditableText from "metabase/common/components/EditableText";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { POST } from "metabase/lib/api";
import { formatValue } from "metabase/lib/formatting/value";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, Group, Stack, Text } from "metabase/ui/components";
import { ActionIcon, Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import { isDate, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  Dataset,
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
  StructuredDatasetQuery,
  TableId,
} from "metabase-types/api";

import {
  getDefaultObjectViewSettings,
  getTableQuery,
} from "../TableListView/utils";

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
  sectionsOverride?: ObjectViewSectionSettings[];
}

const emptyColumns: DatasetColumn[] = [];
export function TableDetailViewInner({
  tableId,
  rowId,
  dataset,
  table,
  isEdit = false,
  isListView = false,
  sectionsOverride,
}: TableDetailViewProps) {
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const dispatch = useDispatch();
  const [updateTableComponentSettings] =
    useUpdateTableComponentSettingsMutation();

  const columns = dataset?.data?.results_metadata?.columns ?? emptyColumns;

  const rows = useMemo(() => dataset?.data?.rows || [], [dataset]);
  const row = rows[currentRowIndex] || {};

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
    replaceAllSections,
  } = useDetailViewSections(initialSections);

  const sectionsOrOverride = isListView
    ? (sectionsOverride ?? sections)
    : sections;

  const notEmptySections = isEdit
    ? sectionsOrOverride
    : sectionsOrOverride.filter((section) => section.fields.length > 0);

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
            sections: sectionsOrOverride,
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
    sectionsOrOverride,
    dispatch,
    rowId,
  ]);

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

  const [isGenerating, setIsGenerating] = useState(false);
  const handleGenerateConfiguration = async () => {
    setIsGenerating(true);
    try {
      const response = await POST("/api/ee/metabot-tools/table-view-config")({
        table_id: tableId,
        view_type: "detail",
      });

      if (response.success && response.config?.object_view?.sections) {
        replaceAllSections(response.config.object_view.sections);
      } else {
        console.error("Failed to generate configuration:", response.error);
      }
    } catch (error) {
      console.error("Error generating configuration:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Group align="flex-start" gap={0} wrap="nowrap" h="100%">
      <Box m="auto" mt={isListView ? 0 : "md"} w="70%">
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
            onSaveClick={handleSaveClick}
          />
        )}
        <Stack gap="md" mt={isListView ? 0 : "lg"}>
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
                  isListView={isListView}
                  onUpdateSection={(update) =>
                    updateSection(section.id, update)
                  }
                  onRemoveSection={() => removeSection(section.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </Stack>
        {isEdit && !isListView && (
          <Flex align="center" justify="center" w="100%" mt="md">
            <Button leftSection={<Icon name="add" />} onClick={createSection} />
          </Flex>
        )}
      </Box>
      {isEdit && !isListView && (
        <Box
          bg="white"
          h="100%"
          w="20%"
          p="lg"
          style={{
            borderLeft: `1px solid var(--mb-border-color)`,
            overflowY: "auto",
          }}
        >
          <Flex justify="space-between" align="center" mb="xs" pb="sm">
            <Text fw={600} size="lg">{t`Detail view settings`}</Text>
            <ActionIcon
              variant="filled"
              color="brand"
              size="md"
              loading={isGenerating}
              onClick={handleGenerateConfiguration}
              aria-label={t`Generate with AI`}
              style={{
                background:
                  "linear-gradient(135deg, var(--mb-color-brand) 0%, var(--mb-color-brand-light) 100%)",
              }}
            >
              <Icon name="ai" size={18} />
            </ActionIcon>
          </Flex>
          <DetailViewSidebar
            columns={columns}
            sections={sectionsOrOverride}
            onCreateSection={createSection}
            onUpdateSection={updateSection}
          />
        </Box>
      )}
    </Group>
  );
}

type SortableSectionProps = {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  row: RowValues;
  tableId: TableId;
  isEdit: boolean;
  isListView: boolean;
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
    transform: CSS.Translate.toString(transform),
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
  tableId: TableId;
  isEdit: boolean;
  isListView: boolean;
  onUpdateSection: (section: Partial<ObjectViewSectionSettings>) => void;
  onRemoveSection: () => void;
  dragHandleProps?: any;
};

function ObjectViewSection({
  section,
  columns,
  row,
  tableId,
  isEdit,
  isListView,
  onUpdateSection,
  onRemoveSection,
  dragHandleProps,
}: ObjectViewSectionProps) {
  const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs

  return (
    <Box
      className={S.ObjectViewSection}
      pos="relative"
      bg={isEdit ? "bg-medium" : undefined}
      px="md"
      py="sm"
      style={{ borderRadius: "var(--default-border-radius)" }}
    >
      <Group gap="xs">
        {isEdit && !isListView && (
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
        className={S.SectionContent}
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
              <Text
                c="text-dark"
                fw={600}
                size="sm"
                style={{
                  whiteSpace: "nowrap",
                }}
              >
                {column.display_name}
              </Text>
              <Text
                {...getStyleProps(style)}
                lineClamp={5}
                style={{
                  ...(isDate(column) ? { whiteSpace: "nowrap" } : {}),
                }}
              >
                {formatValue(value, { column })}
              </Text>
            </Box>
          );
        })}
      </Flex>
      {isEdit && !isListView && (
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

      {isListView && (
        <ActionIcon
          className={S.link}
          component={Link}
          pos="absolute"
          top={8}
          right={8}
          to={
            pkIndex !== undefined && pkIndex >= 0
              ? `/table/${tableId}/detail/${row[pkIndex]}`
              : ""
          }
          variant="outline"
        >
          <Icon name="share" />
        </ActionIcon>
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
