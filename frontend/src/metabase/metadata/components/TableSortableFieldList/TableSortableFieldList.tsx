import { sortBy } from "es-toolkit";
import { useMemo } from "react";

import { SortableFieldList } from "metabase/metadata/components";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { FieldId, Table } from "metabase-types/api";

type TableSortableFieldListProps = {
  table: Table;
  activeFieldId?: FieldId;
  onChange: (fieldOrder: FieldId[]) => void;
};

export function TableSortableFieldList({
  table,
  onChange,
}: TableSortableFieldListProps) {
  const fields = useMemo(() => {
    return sortBy(table.fields ?? [], [(item) => item.position]);
  }, [table.fields]);

  return (
    <SortableFieldList
      fields={fields}
      getFieldKey={getRawTableFieldId}
      onChange={onChange}
    />
  );
}
