import { SortableContext, useSortable, verticalListSortingStrategy, } from "@dnd-kit/sortable";
import { CSS } from '@dnd-kit/utilities';
import cx from "classnames";
import { Fragment } from "react";
import { Link } from "react-router";
import { t } from "ttag";


import EditableText from "metabase/common/components/EditableText";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { useTranslateContent } from "metabase/i18n/hooks";
import { getUrl } from "metabase/metadata/pages/DataModel/utils";
import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Text,
} from "metabase/ui/components";
import { isFK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
  SectionVariant,
  Table,
  TableId,
} from "metabase-types/api";

import { renderValue } from "../utils";

import { renderItemIcon } from "./ColumnPicker";
import { SectionActions } from "./SectionActions";
import S from "./TableDetailView.module.css";

type SectionFieldProps = {
  field_id: number;
  column: DatasetColumn;
  value: any;
  table: Table;
  variant: SectionVariant;
  isEdit: boolean;
  onUpdateSection?: (section: Partial<ObjectViewSectionSettings>) => void;
  section: ObjectViewSectionSettings;
  tc: any;
  dragHandleProps?: any;
};

function SectionField({
  field_id,
  column,
  value,
  table,
  variant,
  isEdit,
  onUpdateSection,
  section,
  tc,
  dragHandleProps,
}: SectionFieldProps) {
  const isForeignKey = isFK(column);
  const field = table.fields?.find((f) => f.id === field_id);
  const newTableId = field?.target?.table_id;
  const link = isForeignKey
    ? `/table/${newTableId}/detail/${value}`
    : undefined;

  return (
    <Fragment key={field_id}>
      <Flex className={S.Field}>
        <Box className={S.FieldName} w="100%">
          {isEdit && (
            <Icon
              name="grabber"
              style={{ cursor: "grab" }}
              role="button"
              tabIndex={0}
              {...dragHandleProps}
            />
          )}
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
            <Ellipsified
              alwaysShowTooltip={variant === "subheader"}
              variant="primary"
              truncate={false}
              c="var(--mb-color-text-primary)"
              lines={variant === "highlight-2" ? 3 : 0}
              style={{
                flexGrow: 1,
              }}
              className={S.FieldValue}
              fz={undefined}
              {...(variant === "subheader" && {
                tooltip: column.display_name,
              })}
            >
              {renderValue(tc, value, column)}
            </Ellipsified>
          </Link>
        )}

        {!link && (
          <Ellipsified
            alwaysShowTooltip={variant === "subheader"}
            variant="primary"
            truncate={false}
            c="var(--mb-color-text-primary)"
            lines={variant === "highlight-2" ? 3 : 0}
            style={{
              flexGrow: 1,
            }}
            className={S.FieldValue}
            fz={undefined}
            {...(variant === "subheader" && {
              tooltip: column.display_name,
            })}
          >
            {renderValue(tc, value, column)}
          </Ellipsified>
        )}

        {isEdit && onUpdateSection && (
          <ActionIcon
            className={S.FieldRemoveButton}
            size="1rem"
            onClick={() =>
              onUpdateSection({
                fields: section.fields.filter(
                  (f) => f.field_id !== field_id,
                ),
              })
            }
          >
            <Icon name="close" />
          </ActionIcon>
        )}
      </Flex>
    </Fragment>
  );
}

function SortableSectionField({
  ...props
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.field_id,
    disabled: !props.isEdit
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SectionField
        {...props}
        dragHandleProps={props.isEdit ? { ...attributes, ...listeners } : undefined}
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

  if (variant === "header") {
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

  return (
    <Box
      className={cx(S.ObjectViewSection, {
        [S.normal]: variant === "normal",
        [S.subheader]: variant === "subheader",
        [S.highlight1]: variant === "highlight-1",
        [S.highlight2]: variant === "highlight-2",
        [S.hovered]: isHovered,
        [S.EditMode]: isEdit,
      })}
      mt={variant !== "subheader" ? "sm" : undefined}
      px={variant !== "subheader" ? "lg" : undefined}
      py={variant !== "subheader" ? "lg" : undefined}
      bg={variant !== "subheader" ? "white" : undefined}
      pos="relative"
      style={
        variant !== "subheader"
          ? {
            border: "1px solid var(--mb-color-border)",
            borderRadius: "var(--mantine-radius-md)",
            // overflow: "hidden",
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

      {onUpdateSection && (
        <Group gap="md" p={0} className={S.SectionTitle}>
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
            isDisabled={!isEdit || section.variant === "subheader"}
            onChange={(title) => onUpdateSection({ title })}
            placeholder={t`Section title`}
            style={{
              fontWeight: 700,
              fontSize: "1.25rem",
              marginBottom: section.variant === "subheader" ? 0 : "2rem",
              opacity: section.variant === "subheader" ? 0.5 : 1,
              ...(section.variant === "subheader" &&
                !isEdit && {
                display: "none",
              }),
            }}
          />
        </Group>
      )}

      <Flex className={S.SectionContent}>
        <SortableContext items={section.fields.map(f => f.field_id)} strategy={verticalListSortingStrategy}>
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
    </Box>
  );
}
