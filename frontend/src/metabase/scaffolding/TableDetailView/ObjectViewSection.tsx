import cx from "classnames";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, Flex, Group, Text, Tooltip } from "metabase/ui/components";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
  SectionVariant,
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
  onUpdateSection?: (section: Partial<ObjectViewSectionSettings>) => void;
  dragHandleProps?: any;
  variant: SectionVariant;
};

export function ObjectViewSection({
  variant = "normal",
  section,
  columns,
  row,
  // tableId,
  // isEdit,
  onUpdateSection,
  // dragHandleProps,
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
      <Box className={cx(S.ObjectViewSection, S.header)}>
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
      <Flex
        className={S.SectionContent}
        style={{
          gridTemplateColumns: `repeat(${Math.min(section.fields.length, 3)}, 1fr)`,
        }}
      >
        {section.fields.map(({ field_id }) => {
          const columnIndex = columns.findIndex(
            (column) => column.id === field_id,
          );
          const column = columns[columnIndex];

          if (!column) {
            return null;
          }

          const value = row[columnIndex];

          return (
            <Flex key={field_id} className={S.Field}>
              <Box className={S.FieldName} w="100%">
                <Tooltip label={column.description} position="top">
                  <Text c="var(--mb-color-text-secondary)" fw="bold" truncate>
                    {column.display_name}
                  </Text>
                </Tooltip>
              </Box>
              <Ellipsified
                variant="primary"
                truncate={variant !== "highlight-2"}
                c="var(--mb-color-text-primary)"
                lines={3}
                style={{
                  flexGrow: 1,
                }}
                className={S.FieldValue}
                fz={undefined}
              >
                {renderValue(tc, value, column)}
              </Ellipsified>
            </Flex>
          );
        })}
      </Flex>
    </Box>
  );
}
