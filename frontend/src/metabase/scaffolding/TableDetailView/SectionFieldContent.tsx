import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getUrl } from "metabase/metadata/pages/DataModel/utils";
import { ActionIcon, Box, Flex, Icon, Text } from "metabase/ui/components";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  SectionVariant,
  Table,
} from "metabase-types/api";

import { getFieldDraggableKey } from "../dnd/utils";
import { renderValue } from "../utils";

import { renderItemIcon } from "./ColumnPicker";
import { ColumnPopover } from "./ColumnPopover";
import { DragHandle } from "./DragHandle";
import S from "./TableDetailView.module.css";
import { UNCATEGORIZED_SECTION_ID } from "./use-detail-view-sections";

export function SectionFieldContent({
  isEdit,
  column,
  table,
  link,
  query,
  queryColumn,
  value,
  variant,
  tc,
  isFixedSection,
  onUpdateSection,
  field_id,
  section,
}: {
  isEdit: boolean;
  column: DatasetColumn;
  table: Table;
  link: string;
  query: Query;
  queryColumn: QueryColumn;
  value: any;
  variant: SectionVariant;
  tc: TranslateContent;
  isFixedSection: boolean;
  onUpdateSection: (section: Partial<ObjectViewSectionSettings>) => void;
  field_id: number;
  section: ObjectViewSectionSettings;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getFieldDraggableKey({ field_id }),
  });

  const { active } = useDndContext();

  const style = {
    transform: CSS.Translate.toString(transform),
    // dirty hack to fix animation of the field while dragging another field
    transition: active ? "transform 200ms" : transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Flex ref={setNodeRef} className={S.Field} style={style}>
      <Box className={S.FieldName} w="100%">
        {isEdit && <DragHandle {...attributes} {...listeners} />}

        <Text c="var(--mb-color-text-secondary)" fw="bold" truncate>
          {column.display_name}
        </Text>

        <Link
          to={getUrl({
            tableId: table.id,
            schemaName: table.schema,
            databaseId: table.db_id,
            fieldId: column.id,
          })}
          className={S.FieldIcon}
        >
          {renderItemIcon(table, {
            name: column.display_name,
            displayName: column.display_name,
            column,
          })}
        </Link>
      </Box>

      {link && (
        <Link to={link} className={S.link}>
          {isEdit && isFixedSection && (
            <DragHandle {...attributes} {...listeners} />
          )}

          <ColumnPopover
            disabled={!isFixedSection}
            query={query}
            stageIndex={0}
            column={queryColumn}
          >
            <Ellipsified
              variant="primary"
              truncate={false}
              c="var(--mb-color-text-primary)"
              lines={variant === "highlight-2" ? 3 : 0}
              style={{
                flexGrow: 1,
              }}
              className={S.FieldValue}
              fz={undefined}
            >
              {renderValue(tc, value, column)}
            </Ellipsified>
          </ColumnPopover>
        </Link>
      )}

      {!link && (
        <>
          {isEdit && isFixedSection && (
            <DragHandle {...attributes} {...listeners} />
          )}

          <ColumnPopover
            disabled={!isFixedSection}
            query={query}
            stageIndex={0}
            column={queryColumn}
          >
            <Ellipsified
              variant="primary"
              truncate={false}
              c="var(--mb-color-text-primary)"
              lines={variant === "highlight-2" ? 3 : 0}
              style={{
                flexGrow: 1,
              }}
              className={S.FieldValue}
              fz={undefined}
            >
              {renderValue(tc, value, column)}
            </Ellipsified>
          </ColumnPopover>
        </>
      )}

      {isEdit && onUpdateSection && section.id !== UNCATEGORIZED_SECTION_ID && (
        <ActionIcon
          className={S.FieldRemoveButton}
          size={variant === "header" ? 32 : 16}
          onClick={() =>
            onUpdateSection({
              fields: section.fields.filter((f) => f.field_id !== field_id),
            })
          }
        >
          <Icon name="close" tooltip={t`Remove field`} />
        </ActionIcon>
      )}
    </Flex>
  );
}
