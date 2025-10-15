import { useCallback, useEffect, useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";

import { TablePicker } from "./TablePicker";
import type { TreePath } from "./types";
import { getUrl } from "./utils";

export function RouterTablePicker({
  databaseId,
  schemaName,
  tableId,
  modelId,
  className,
}: TreePath & { className?: string }) {
  const dispatch = useDispatch();
  const [value, setValue] = useState<TreePath>({
    databaseId,
    schemaName,
    tableId,
    modelId,
  });

  const onChange = useCallback(
    (value: TreePath) => {
      setValue(value);

      // Update URL only when either opening a table or no table has been opened yet.
      // We want to keep user looking at a table when navigating databases/schemas.
      const canUpdateUrl =
        value.tableId != null ||
        value.modelId != null ||
        (tableId == null && modelId == null);

      if (canUpdateUrl) {
        dispatch(push(getUrl(value)));
      }
    },
    [dispatch, modelId, tableId],
  );

  useEffect(() => {
    setValue({
      databaseId,
      schemaName,
      tableId,
      modelId,
    });
  }, [databaseId, schemaName, tableId, modelId]);

  return <TablePicker path={value} className={className} onChange={onChange} />;
}

export function UncontrolledTablePicker({
  initialValue,
  onChange,
}: {
  initialValue: TreePath;
  onChange?: (path: TreePath) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const handleChange = useCallback(
    (value: TreePath) => {
      onChange?.(value);
      setValue(value);
    },
    [onChange],
  );
  return <TablePicker path={value} onChange={handleChange} />;
}
