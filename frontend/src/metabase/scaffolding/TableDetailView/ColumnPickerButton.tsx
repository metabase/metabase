import { useState } from "react";
import { t } from "ttag";

import { Button, Popover } from "metabase/ui";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  Table,
} from "metabase-types/api";

import { ColumnPicker } from "./ColumnPicker";

interface Props {
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
  table: Table;
  onChange: (column: DatasetColumn) => void;
}

export const ColumnPickerButton = ({
  columns,
  sections,
  table,
  onChange,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      opened={isOpen}
      onChange={setIsOpen}
      position="bottom-start"
      offset={4}
    >
      <Popover.Target>
        <Button onClick={() => setIsOpen(true)}>{t`Click`}</Button>
      </Popover.Target>

      <Popover.Dropdown>
        <ColumnPicker
          columns={columns}
          sections={sections}
          table={table}
          onChange={onChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
