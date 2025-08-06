import cx from "classnames";
import { Link } from "react-router";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, Flex, Group, Text, Tooltip } from "metabase/ui/components";
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

import S from "./TableDetailView.module.css";

type ObjectViewSectionProps = {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  row: RowValues;
  tableId: TableId;
  isEdit: boolean;
  table: Table;
  onUpdateSection?: (section: Partial<ObjectViewSectionSettings>) => void;
  dragHandleProps?: any;
  variant: SectionVariant;
  isHovered?: boolean;
};

export function ObjectViewSection({
  variant = "normal",
  section,
  columns,
  row,
  // tableId,
  table,
  // isEdit,
  onUpdateSection,
  // dragHandleProps,
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
        })}
      >
        <Flex className={S.SectionContent}>
          <Ellipsified
            variant="primary"
            truncate
            c="var(--mb-color-text-primary)"
            style={{
              flexGrow: 1,
            }}
            className={S.FieldValue}
            fz={undefined}
          >
            {headerText}
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
      })}
    >
      {onUpdateSection && (
        <Group gap="md" className={S.SectionTitle}>
          {/* {isEdit && (
          <Icon
          name="grabber"
          style={{ cursor: "grab" }}
          role="button"
          tabIndex={0}
          {...dragHandleProps}
          />
        )} */}
          <Text p={0} fw={700} fz="1.25rem" mb="xl">
            {section.title}
          </Text>
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
            <>
              <Flex key={field_id} className={S.Field}>
                <Box className={S.FieldName} w="100%">
                  <Tooltip
                    disabled={!column.description}
                    label={column.description}
                    position="top"
                  >
                    <Text c="var(--mb-color-text-secondary)" fw="bold" truncate>
                      {column.display_name}
                    </Text>
                  </Tooltip>
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
              </Flex>

              {index < section.fields.length - 1 && variant === "subheader" && (
                <div className={S.separator} />
              )}
            </>
          );
        })}
      </Flex>
    </Box>
  );
}
