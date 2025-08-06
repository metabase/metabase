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
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { useMount } from "react-use";

import { useUpdateTableComponentSettingsMutation } from "metabase/api/table";
import { useDispatch } from "metabase/lib/redux";
import { question } from "metabase/lib/urls";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { closeNavbar } from "metabase/redux/app";
import { Divider, Stack } from "metabase/ui/components";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import { isEntityName, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  Dataset,
  DatasetColumn,
  ObjectViewSectionSettings,
} from "metabase-types/api";

import { getDefaultObjectViewSettings } from "../utils";

import { DetailViewContainer } from "./DetailViewContainer";
import { SortableSection } from "./SortableSection";
import { useDetailViewSections } from "./use-detail-view-sections";
import { useForeignKeyReferences } from "./use-foreign-key-references";

interface TableDetailViewProps {
  tableId: number;
  rowId: number | string;
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
  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);
  const [hoveredSectionIdMain, setHoveredSectionIdMain] = useState<
    number | null
  >(null);
  const [hoveredSectionIdSidebar, setHoveredSectionIdSidebar] = useState<
    number | null
  >(null);
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
    updateSections,
    removeSection,
    handleDragEnd,
  } = useDetailViewSections(initialSections);

  const notEmptySections = useMemo(() => {
    return sections.filter((section) => section.fields.length > 0);
  }, [sections]);

  const fieldsInSections = notEmptySections.flatMap((s) => s.fields);
  const fieldsInSectionsIds = fieldsInSections.map((f) => f.field_id);
  const fields = table?.fields ?? [];
  const fieldIds = fields.map(getRawTableFieldId);
  const uncategorizedSection: ObjectViewSectionSettings = {
    id: -1,
    title: "",
    variant: "normal",
    fields: fieldIds
      .filter((id) => {
        return !fieldsInSectionsIds.includes(id);
      })
      .map((field_id) => ({ field_id })),
  };
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
          ...table?.component_settings,
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

  const hasRelationships = tableForeignKeys.length > 0;

  return (
    <DetailViewContainer
      rowId={rowId}
      rowName={rowName}
      table={table}
      isEdit={isEdit}
      rows={rows}
      currentRowIndex={currentRowIndex}
      columns={columns}
      sections={sections}
      tableForeignKeys={tableForeignKeys}
      tableForeignKeyReferences={tableForeignKeyReferences}
      openPopoverId={openPopoverId}
      setOpenPopoverId={setOpenPopoverId}
      hasRelationships={hasRelationships}
      onEditClick={handleEditClick}
      onPreviousItemClick={handleViewPreviousObjectDetail}
      onNextItemClick={handleViewNextObjectDetail}
      onCloseClick={handleCloseClick}
      onSaveClick={handleSaveClick}
      onCreateSection={createSection}
      onUpdateSection={updateSection}
      onUpdateSections={updateSections}
      onRemoveSection={removeSection}
      onDragEnd={handleDragEnd}
      onCancel={handleCloseClick}
      onSubmit={handleSaveClick}
      onFollowForeignKey={handleFollowForeignKey}
      hoveredSectionId={hoveredSectionIdMain}
      setHoveredSectionId={setHoveredSectionIdSidebar}
    >
      <Stack gap="md" mt="md" mb="sm" py="md" bg="transparent">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            disabled
            items={notEmptySections.map((section) => section.id)}
            strategy={verticalListSortingStrategy}
          >
            {notEmptySections.map((section, index) => (
              <Fragment key={section.id}>
                {index > 0 &&
                  (section.variant === "normal" ||
                    section.variant === "highlight-2") && (
                    <Divider my="md" mx="md" />
                  )}
                <SortableSection
                  section={section}
                  variant={section.variant}
                  columns={columns}
                  row={row}
                  tableId={tableId}
                  isEdit={isEdit}
                  onUpdateSection={(update) =>
                    updateSection(section.id, update)
                  }
                  table={table}
                  isHovered={
                    isEdit &&
                    (hoveredSectionIdMain === section.id ||
                      hoveredSectionIdSidebar === section.id)
                  }
                  onHoverStart={() => setHoveredSectionIdMain(section.id)}
                  onHoverEnd={() => setHoveredSectionIdMain(null)}
                />
              </Fragment>
            ))}

            {notEmptySections.length > 0 &&
              uncategorizedSection.fields.length > 0 && (
                <Divider my="md" mx="md" />
              )}
            <SortableSection
              section={uncategorizedSection}
              variant={uncategorizedSection.variant}
              columns={columns}
              row={row}
              tableId={tableId}
              table={table}
              isEdit={isEdit}
              // onUpdateSection={(update) => updateSection(section.id, update)}
              // onRemoveSection={
              //   notEmptySections.length > 1
              //     ? () => removeSection(section.id)
              //     : undefined
              // }
            />
          </SortableContext>
        </DndContext>
      </Stack>
    </DetailViewContainer>
  );
}
