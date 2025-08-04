import cx from "classnames";

import EditableText from "metabase/common/components/EditableText";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, Flex, Group, Text } from "metabase/ui/components";
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

type ObjectViewSectionProps = {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  row: RowValues;
  tableId: TableId;
  isEdit: boolean;
  onUpdateSection: (section: Partial<ObjectViewSectionSettings>) => void;
  onRemoveSection?: () => void;
  dragHandleProps?: any;
  type: SectionVariant;
};

export function ObjectViewSection({
  type = "normal",
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

  return (
    <Box
      className={cx(S.ObjectViewSection, {
        [S.normal]: type === "normal",
        [S.header]: type === "header",
        [S.subheader]: type === "subheader",
        [S.highlight1]: type === "highlight-1",
        [S.highlight2]: type === "highlight-2",
      })}
      pos="relative"
      bg={isEdit ? "bg-medium" : "bg-white"}
      px="md"
      py="sm"
      style={{
        border: isEdit ? "1px solid var(--border-color)" : "none",
        borderRadius: "var(--default-border-radius)",
      }}
    >
      <Group gap="xs" mb="xl">
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
          initialValue={section.title}
          isDisabled={!isEdit}
          onChange={(title) => onUpdateSection({ title })}
          style={{ fontWeight: 700, fontSize: "1.25rem" }}
        />
      </Group>
      <Flex gap="md" mt={"sm"} px="xs" className={S.SectionContent}>
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
              <Text
                c="var(--mb-color-text-secondary)"
                fw="bold"
                truncate
                className={S.FieldName}
              >
                {column.display_name}
              </Text>
              <Text
                variant="primary"
                truncate
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
      {isEdit && onRemoveSection && (
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
