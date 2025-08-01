import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { useTranslateContent } from "metabase/i18n/hooks";
import { formatValue } from "metabase/lib/formatting/value";
import { Box, Flex, Group, Text, Tooltip } from "metabase/ui/components";
import { ActionIcon } from "metabase/ui/components/buttons";
import { Icon } from "metabase/ui/components/icons";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
  TableId,
} from "metabase-types/api";

import { getStyleProps, renderValue } from "../utils";

import S from "./TableDetailView.module.css";

type ObjectViewSectionProps = {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  row: RowValues;
  tableId: TableId;
  isEdit: boolean;
  onUpdateSection: (section: Partial<ObjectViewSectionSettings>) => void;
  onRemoveSection?: () => void;
  dragHandleProps?: any;
};

export function ObjectViewSection({
  section,
  columns,
  row,
  // tableId,
  isEdit,
  onUpdateSection,
  onRemoveSection,
  dragHandleProps,
}: ObjectViewSectionProps) {
  // const pkIndex = columns.findIndex(isPK); // TODO: handle multiple PKs
  const tc = useTranslateContent();

  return (
    <Box
      className={S.ObjectViewSection}
      pos="relative"
      bg={isEdit ? "bg-medium" : "bg-white"}
      px="md"
      py="sm"
      style={{
        border: isEdit ? "1px solid var(--border-color)" : "none",
        borderRadius: "var(--default-border-radius)",
      }}
    >
      <Group gap="xs">
        {isEdit && (
          <Icon
            name="grabber"
            style={{ cursor: "grab" }}
            role="button"
            tabIndex={0}
            {...dragHandleProps}
          />
        )}
        {isEdit && (
          <EditableText
            initialValue={section.title}
            isDisabled={!isEdit}
            onChange={(title) => onUpdateSection({ title })}
            style={{ fontWeight: 700 }}
          />
        )}
      </Group>
      <Flex
        direction={section.direction === "vertical" ? "column" : "row"}
        gap="md"
        mt={"sm"}
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
                c="var(--mb-color-text-secondary)"
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
                {isEdit
                  ? formatValue(value, { column })
                  : renderValue(tc, value, column)}
              </Text>
            </Box>
          );
        })}
      </Flex>
      {isEdit && onRemoveSection && (
        <Group
          className={S.ObjectViewSectionActions}
          pos="absolute"
          bg="bg-white"
          style={{ borderRadius: "var(--default-border-radius)" }}
          top={-5}
          right={-5}
        >
          <Tooltip label={t`Remove section`}>
            <ActionIcon onClick={onRemoveSection}>
              <Icon name="close" />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
    </Box>
  );
}
