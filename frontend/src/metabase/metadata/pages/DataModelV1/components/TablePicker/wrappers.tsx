import { useCallback, useEffect, useState } from "react";

import { useLocation, useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";

import { TablePicker } from "./components";
import type { ChangeOptions, TreePath } from "./types";

export function RouterTablePicker(props: TreePath) {
  const navigate = useNavigate();
  const [value, setValue] = useState(props);
  const location = useLocation();
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
            navigate(Urls.dataModel(value), { replace: true });
          }
        } else {
          navigate(Urls.dataModel(value));
        }
      }
    },
    [isSegments, props, navigate],
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
