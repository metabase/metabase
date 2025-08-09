import { useState } from "react";
import { t } from "ttag";

import { Popover, Tooltip } from "metabase/ui";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  Table,
} from "metabase-types/api";

import { ColumnPicker } from "./ColumnPicker";
import { SectionAction } from "./SectionAction";

interface Props {
  columns: DatasetColumn[];
  fieldsLimit?: number;
  section: ObjectViewSectionSettings;
  sections: ObjectViewSectionSettings[];
  table: Table;
  onUpdateSection: (update: Partial<ObjectViewSectionSettings>) => void;
}

export const ColumnPickerButton = ({
  columns,
  fieldsLimit,
  section,
  sections,
  table,
  onUpdateSection,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const limitReached =
    typeof fieldsLimit === "number" && section.fields.length >= fieldsLimit;

  const sectionFieldIds = new Set(
    sections.flatMap((section) => {
      return section.fields.map((field) => field.field_id);
    }),
  );
  const unsectionedColumns = columns.filter(
    (column) => column.id && !sectionFieldIds.has(column.id),
  );

  const handleChange = (column: DatasetColumn) => {
    const newField = { field_id: column.id as number };
    const fields = [...section.fields, newField];

    const limitReached =
      typeof fieldsLimit === "number" && fields.length >= fieldsLimit;
    const wasThisLastColumnToUse = unsectionedColumns.length === 1;

    if (limitReached || wasThisLastColumnToUse) {
      setIsOpen(false);
    }

    onUpdateSection({ fields });
  };

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="bottom-end"
      offset={4}
    >
      <Popover.Target>
        <Tooltip
          label={
            unsectionedColumns.length === 0
              ? t`All columns are used`
              : limitReached
                ? t`This group supports up to ${fieldsLimit} columns`
                : t`Add columns`
          }
        >
          <SectionAction
            disabled={limitReached || unsectionedColumns.length === 0}
            iconName="add"
            onClick={() => setIsOpen(true)}
          />
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown>
        <ColumnPicker
          columns={columns}
          sections={sections}
          table={table}
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
