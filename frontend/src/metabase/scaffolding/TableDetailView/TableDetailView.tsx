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
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import {
  useGetTableQueryMetadataQuery,
  useListTableForeignKeysQuery,
  useUpdateTableComponentSettingsMutation,
} from "metabase/api/table";
import EditableText from "metabase/common/components/EditableText";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { formatValue } from "metabase/lib/formatting/value";
import { useDispatch } from "metabase/lib/redux";
import { question } from "metabase/lib/urls";
import { Box, Flex, Group, Stack, Text, Tooltip } from "metabase/ui/components";
import { Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import { Relationships } from "metabase/visualizations/components/ObjectDetail/ObjectRelationships";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import { isDate, isEntityName, isPK } from "metabase-lib/v1/types/utils/isa";
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
import { useForeignKeyReferences } from "./use-foreign-key-references";

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
  const { data: tableForeignKeys = [] } = useListTableForeignKeysQuery(tableId);

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
      tableForeignKeys={tableForeignKeys}
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
  tableForeignKeys: any[];
  isEdit: boolean;
  isListView?: boolean;
  sectionsOverride?: ObjectViewSectionSettings[];
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
  isListView = false,
  sectionsOverride,
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
  // const nameColumn = columns[nameIndex];
  const rowName = nameIndex == null ? null : row[nameIndex];

  const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs

  // Check if we have relationships to show
  const hasRelationships = tableForeignKeys.length > 0;

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
        {hasRelationships && !isListView && (
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
            <Text fw={600} size="lg" mb="xs" pb="sm">{t`Detail view settings`}</Text>

            <DetailViewSidebar
              columns={columns}
              sections={sectionsOrOverride}
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

  const ListContainer = ({ children }: { children: ReactNode }) => (
    <Box
      component={Link}
      to={
        pkIndex !== undefined && pkIndex >= 0
          ? `/table/${tableId}/detail/${row[pkIndex]}`
          : ""
      }
    >
      {children}
    </Box>
  );

  const Container = isListView ? ListContainer : DetailContainer;
  return (
    <Container>
      {/* {isEdit && !isListView && (
        <Flex align="center" justify="center" w="100%" mt="md">
          <Tooltip label={t`Add section`}>
            <Button leftSection={<Icon name="add" />} onClick={() => createSection({ position: "start" })} />
          </Tooltip>
        </Flex>
      )} */}

      <Stack gap="md" mt={isListView ? 0 : "md"} mb={isListView ? 0 : "sm"}>
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

      {isEdit && !isListView && (
        <Flex align="center" justify="center" w="100%" mt="md">
          <Tooltip label={t`Add section`}>
            <Button leftSection={<Icon name="add" />} onClick={createSection} />
          </Tooltip>
        </Flex>
      )}
    </Container>
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
  onRemoveSection?: () => void;
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
  onRemoveSection?: () => void;
  dragHandleProps?: any;
};

function ObjectViewSection({
  section,
  columns,
  row,
  // tableId,
  isEdit,
  isListView,
  onUpdateSection,
  onRemoveSection,
  dragHandleProps,
}: ObjectViewSectionProps) {
  // const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs

  return (
    <Box
      className={S.ObjectViewSection}
      pos="relative"
      bg={isEdit && !isListView ? "bg-medium" : "bg-white"}
      px="md"
      py="sm"
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: "var(--default-border-radius)",
      }}
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
        mt={isListView ? 0 : "sm"}
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
      {isEdit && !isListView && onRemoveSection && (
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
