import { useMemo } from "react";
import _ from "underscore";

import { SortableFieldList } from "metabase/metadata/components";
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
    return _.sortBy(table.fields ?? [], (item) => item.position);
  }, [table.fields]);

  return (
    <SortableFieldList
      fields={fields}
      getFieldKey={(field) => field.id}
      onChange={onChange}
    />
  );
}
