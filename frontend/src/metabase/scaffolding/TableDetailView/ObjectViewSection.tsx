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
  // dragHandleProps,
  isHovered = false,
}: ObjectViewSectionProps) {
  // const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs
  const tc = useTranslateContent();
  const isSubheader = variant === "subheader";

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
      mt={!isSubheader ? "sm" : undefined}
      px={!isSubheader ? "lg" : undefined}
      py={!isSubheader ? "lg" : undefined}
      bg={!isSubheader ? "white" : undefined}
      pos="relative"
      style={
        !isSubheader
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

      {onUpdateSection && (section.title || isEdit) && (
        <Group gap="md" p={0} className={S.SectionTitle}>
          {/* {isEdit && (
          <Icon
          name="grabber"
          style={{ cursor: "grab" }}
          role="button"
          tabIndex={0}
          {...dragHandleProps}
          />
        )} */}
          <EditableText
            isOptional
            initialValue={section.title}
            isDisabled={!isEdit || section.variant === "subheader"}
            onChange={(title) => onUpdateSection({ title })}
            placeholder={t`Section title`}
            style={{
              fontWeight: 700,
              fontSize: isSubheader ? "0.825rem" : "1.25rem",
              padding: 0,
              marginBottom: isSubheader ? 0 : "2rem",
              minHeight: "1.5rem",
              opacity: isSubheader ? 0.5 : 1,
              ...(isSubheader &&
                (!isEdit || section.fields.length > 0) && {
                  display: "none",
                }),
            }}
          />
        </Group>
      )}

      <Flex className={S.SectionContent}>
        {section.fields.map(({ field_id }, index) => {
          const columnIndex = columns.findIndex(
            (column) => column.id === field_id,
          );
          const column = columns[columnIndex];

          if (!column) {
            return null;
          }

          const value = row[columnIndex];
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

              {index < section.fields.length - 1 &&
                variant === "subheader" &&
                !isEdit && <div className={S.separator} />}
            </Fragment>
          );
        })}
      </Flex>
    </Box>
  );
}
