import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import cx from "classnames";
import { Fragment } from "react";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, Flex, Group } from "metabase/ui";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
  SectionVariant,
  Table,
  TableId,
} from "metabase-types/api";

import { renderValue } from "../utils";

import { getQuery } from "./ColumnPicker";
import { DragHandle } from "./DragHandle";
import { SectionActions } from "./SectionActions";
import { SectionFieldContent } from "./SectionFieldContent";
import S from "./TableDetailView.module.css";

function SortableSectionField({ ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.field_id,
    disabled: !props.isEdit,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SectionFieldContent
        {...props}
        dragHandleProps={
          props.isEdit ? { ...attributes, ...listeners } : undefined
        }
        // isDraggingSection={props.isDraggingSection}
      />
    </div>
  );
}

type ObjectViewSectionProps = {
  section: ObjectViewSectionSettings;
  sections: ObjectViewSectionSettings[];
  columns: DatasetColumn[];
  row: RowValues;
  tableId: TableId;
  isEdit: boolean;
  table: Table;
  onRemoveSection?: () => void;
  onUpdateSection?: (section: Partial<ObjectViewSectionSettings>) => void;
  dragHandleProps?: any;
  variant: SectionVariant;
  isHovered?: boolean;
};

export function ObjectViewSection({
  variant = "normal",
  section,
  sections,
  columns,
  row,
  // tableId,
  table,
  isEdit,
  onRemoveSection,
  onUpdateSection,
  dragHandleProps,
  isHovered = false,
}: ObjectViewSectionProps) {
  // const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs
  const tc = useTranslateContent();
  const isSubheader = variant === "subheader";
  const isHeader = variant === "header";
  const isFixedSection = isSubheader || isHeader;

  if (variant === "header" && !isEdit) {
    // Merging header values in 1 element to handle text-overflow: ellipsis correctly.

    // keep in sync with equivalent implementation in Nav
    const headerText = section.fields
      .map(({ field_id }) => {
        const columnIndex = columns.findIndex(
          (column) => column.id === field_id,
        );
        const column = columns[columnIndex];

        if (!column) {
          return null;
        }

        const value = row[columnIndex];
        return renderValue(tc, value, column, { jsx: false });
      })
      .join(" ");

    return (
      <Box
        className={cx(S.ObjectViewSection, S.header, {
          [S.hovered]: isHovered,
          [S.EditMode]: isEdit,
        })}
      >
        {isEdit && (
          <Box
            className={S.ObjectViewSectionActions}
            pos="absolute"
            top={-16}
            right={16}
          >
            <SectionActions
              columns={columns}
              section={section}
              sections={sections}
              table={table}
              onRemoveSection={onRemoveSection}
              onUpdateSection={onUpdateSection}
            />
          </Box>
        )}

        <Flex className={S.SectionContent}>
          <Ellipsified
            variant="primary"
            truncate
            c="var(--mb-color-text-primary)"
            style={{
              flexGrow: 1,
              opacity: headerText ? 1 : 0.5,
            }}
            className={S.FieldValue}
            fz={undefined}
          >
            {headerText || t`Title`}
          </Ellipsified>
        </Flex>
      </Box>
    );
  }

  const query = getQuery(table);

  return (
    <Box
      className={cx(S.ObjectViewSection, {
        [S.header]: variant === "header",
        [S.normal]: variant === "normal",
        [S.subheader]: variant === "subheader",
        [S.highlight1]: variant === "highlight-1",
        [S.highlight2]: variant === "highlight-2",
        [S.hovered]: isHovered,
        [S.EditMode]: isEdit,
      })}
      mt={!isFixedSection ? "sm" : undefined}
      px={!isFixedSection ? "lg" : undefined}
      py={!isFixedSection ? "lg" : undefined}
      bg={!isFixedSection ? "white" : undefined}
      pos="relative"
      style={
        !isFixedSection
          ? {
              border: "1px solid var(--mb-color-border)",
              borderRadius: "var(--mantine-radius-md)",
            }
          : {}
      }
    >
      {isEdit && (
        <Box
          className={S.ObjectViewSectionActions}
          pos="absolute"
          top={-16}
          right={16}
        >
          <SectionActions
            columns={columns}
            section={section}
            sections={sections}
            table={table}
            onRemoveSection={onRemoveSection}
            onUpdateSection={onUpdateSection}
          />
        </Box>
      )}

      {onUpdateSection && (section.title || isEdit) && (
        <Group
          gap="sm"
          align="center"
          mb={isFixedSection ? 0 : "md"}
          p={0}
          className={S.SectionTitle}
        >
          {isEdit &&
            (section.variant === "normal" ||
              section.variant === "highlight-2") && (
              <DragHandle size="lg" {...dragHandleProps} />
            )}

          {(!isFixedSection || section.fields.length !== 0) && (
            <EditableText
              isOptional
              initialValue={section.title}
              isDisabled={!isEdit || isFixedSection}
              onChange={(title) => onUpdateSection({ title })}
              placeholder={t`Untitled group`}
              style={{
                minHeight: "1.5rem",
                opacity: isFixedSection ? 0.5 : 1,
                marginLeft: isEdit ? 0 : -4,
                marginRight: isEdit ? 0 : -4,
                marginTop: -4,
                marginBottom: -4,
                ...(isFixedSection &&
                  (!isEdit || section.fields.length > 0) && {
                    display: "none",
                  }),
              }}
            />
          )}

          {isFixedSection && section.fields.length === 0 && (
            <Ellipsified
              variant="primary"
              truncate
              c="var(--mb-color-text-primary)"
              style={{
                opacity: 0.5,
                fontSize: isHeader ? "3.125rem" : undefined,
              }}
              fw="bold"
              fz={undefined}
            >
              {isHeader ? t`Title` : t`Subtitle`}
            </Ellipsified>
          )}
        </Group>
      )}

      {/* {section.fields.length > 0 && ( */}
        <Flex className={S.SectionContent}>
          <SortableContext
            items={section.fields.map((f) => f.field_id)}
            strategy={verticalListSortingStrategy}
          >
            {section.fields.map(({ field_id }, index) => {
              const columnIndex = columns.findIndex(
                (column) => column.id === field_id,
              );
              const column = columns[columnIndex];

              if (!column) {
                return null;
              }

              const value = row[columnIndex];

              return (
                <Fragment key={field_id}>
                  <SortableSectionField
                    field_id={field_id}
                    column={column}
                    value={value}
                    table={table}
                    variant={variant}
                    isEdit={isEdit}
                    onUpdateSection={onUpdateSection}
                    section={section}
                    tc={tc}
                  />

                  {index < section.fields.length - 1 &&
                    variant === "subheader" &&
                    !isEdit && <div className={S.separator} />}
                </Fragment>
              );
            })}
          </SortableContext>
        </Flex>
      {/* )} */}
    </Box>
  );
}
