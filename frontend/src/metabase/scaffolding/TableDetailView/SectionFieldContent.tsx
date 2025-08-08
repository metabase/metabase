import { Link } from "react-router";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getUrl } from "metabase/metadata/pages/DataModel/utils";
import { ActionIcon, Box, Flex, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import { isFK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  SectionVariant,
  Table,
} from "metabase-types/api";

import { renderValue } from "../utils";

import { getQuery, renderItemIcon } from "./ColumnPicker";
import { ColumnPopover } from "./ColumnPopover";
import { DragHandle } from "./DragHandle";
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

export function SectionFieldContent({
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
  const isSubheader = variant === "subheader";
  const isHeader = variant === "header";
  const isFixedSection = isSubheader || isHeader;
  const isForeignKey = isFK(column);
  const field = table.fields?.find((f) => f.id === field_id);
  const query = getQuery(table);
  const queryColumn = Lib.fromLegacyColumn(query, 0, column);
  const newTableId = field?.target?.table_id;
  const link = isForeignKey
    ? `/table/${newTableId}/detail/${value}`
    : undefined;

  return (
    <Flex className={S.Field}>
      <Box className={S.FieldName} w="100%">
        {isEdit && <DragHandle {...dragHandleProps} />}

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
          {isEdit && isFixedSection && <DragHandle {...dragHandleProps} />}

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
          {isEdit && isFixedSection && <DragHandle {...dragHandleProps} />}

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

      {isEdit && onUpdateSection && (
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
