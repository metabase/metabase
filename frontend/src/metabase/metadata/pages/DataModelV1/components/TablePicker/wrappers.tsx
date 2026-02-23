import { useCallback, useEffect, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useNavigation } from "metabase/routing";
import { getLocation } from "metabase/selectors/routing";

import { TablePicker } from "./components";
import type { ChangeOptions, TreePath } from "./types";

export function RouterTablePicker(props: TreePath) {
  const { push, replace } = useNavigation();
  const [value, setValue] = useState(props);
  const location = useSelector(getLocation);
  const isSegments = location.pathname?.startsWith("/admin/datamodel/segment");

  const onChange = useCallback(
    (value: TreePath, options?: ChangeOptions) => {
      setValue(value);

      // Update URL only when either opening a table or no table has been opened yet.
      // We want to keep user looking at a table when navigating databases/schemas.
      const canUpdateUrl = value.tableId != null || props.tableId == null;

      if (canUpdateUrl) {
        if (options?.isAutomatic) {
          // prevent auto-navigation from table-picker when Segments tab is open
          if (!isSegments) {
            replace(Urls.dataModel(value));
          }
        } else {
          push(Urls.dataModel(value));
        }
      }
    },
    [push, replace, isSegments, props],
  );

  useEffect(() => {
    setValue(props);
  }, [props]);

  return <TablePicker path={value} onChange={onChange} />;
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
