import { useState } from "react";
import { t } from "ttag";

import { Button, Popover, Tooltip } from "metabase/ui";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  Table,
} from "metabase-types/api";

import { ColumnPicker } from "./ColumnPicker";

interface Props {
  columns: DatasetColumn[];
  fieldsLimit?: number;
  section: ObjectViewSectionSettings;
  sections: ObjectViewSectionSettings[];
  table: Table;
  onUpdateSection: (
    id: number,
    update: Partial<ObjectViewSectionSettings>,
  ) => void;
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

  const handleChange = (column: DatasetColumn) => {
    const newField = { field_id: column.id as number };
    const fields = [...section.fields, newField];

    const limitReached =
      typeof fieldsLimit === "number" && fields.length >= fieldsLimit;

    if (limitReached) {
      setIsOpen(false);
    }

    onUpdateSection(section.id, { fields });
  };

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="bottom-start"
      offset={4}
    >
      <Popover.Target>
        <Tooltip
          disabled={!limitReached}
          label={t`This group supports up to ${fieldsLimit} columns`}
        >
          <Button
            disabled={limitReached}
            onClick={() => setIsOpen(true)}
          >{t`Click`}</Button>
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
