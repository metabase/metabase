import cx from "classnames";

import EditableText from "metabase/common/components/EditableText";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, Flex, Group, Text, Tooltip } from "metabase/ui/components";
import { Button } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
  SectionVariant,
  TableId,
} from "metabase-types/api";

import { renderValue } from "../utils";

import S from "./TableDetailView.module.css";

const REMOVABLE_SECTIONS = ["normal", "highlight-2"];

type ObjectViewSectionProps = {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  row: RowValues;
  tableId: TableId;
  isEdit: boolean;
  onUpdateSection?: (section: Partial<ObjectViewSectionSettings>) => void;
  onRemoveSection?: () => void;
  dragHandleProps?: any;
  variant: SectionVariant;
};

export function ObjectViewSection({
  variant = "normal",
  section,
  columns,
  row,
  // tableId,
  isEdit,
  onUpdateSection,
  onRemoveSection,
  // dragHandleProps,
}: ObjectViewSectionProps) {
  // const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs
  const tc = useTranslateContent();

  if (variant === "header") {
    // Merging header values in 1 element to handle text-overflow: ellipsis correctly.
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
        return renderValue(tc, value, column);
      })
      .join(" ");

    return (
      <Box className={cx(S.ObjectViewSection, S.header)}>
        <Flex className={S.SectionContent}>
          <Text
            variant="primary"
            truncate
            lh="inherit"
            c="var(--mb-color-text-primary)"
            className={S.FieldValue}
          >
            {headerText}
          </Text>
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
        <Group gap="xs">
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
            className={S.SectionTitle}
            initialValue={section.title}
            isDisabled={!isEdit}
            onChange={(title) => onUpdateSection({ title })}
            style={{
              fontWeight: 700,
              fontSize: "1.25rem",
              marginBottom: "2rem",
            }}
          />
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
            <Flex key={field_id} gap="md" className={S.Field}>
              <Tooltip
                openDelay={500}
                closeDelay={100}
                label={column.description}
                position="top"
                withArrow={false}
              >
                <Text
                  c="var(--mb-color-text-secondary)"
                  fw="bold"
                  truncate
                  className={S.FieldName}
                >
                  {column.display_name}
                </Text>
              </Tooltip>
              <Text
                variant="primary"
                truncate
                lh="inherit"
                c="var(--mb-color-text-primary)"
                lineClamp={5}
                style={{
                  ...(isDate(column) ? { whiteSpace: "nowrap" } : {}),
                  flexGrow: 1,
                }}
                className={S.FieldValue}
              >
                {renderValue(tc, value, column)}
              </Text>
            </Flex>
          );
        })}
      </Flex>
      {isEdit && onRemoveSection && REMOVABLE_SECTIONS.includes(variant) && (
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
