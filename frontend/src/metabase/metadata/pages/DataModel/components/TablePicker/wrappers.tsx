import { useCallback, useEffect, useState } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";

import { TablePicker } from "./TablePicker";
import type { ChangeOptions, TreePath } from "./types";
import { getUrl } from "./utils";

export function RouterTablePicker(props: TreePath) {
  const dispatch = useDispatch();
  const [value, setValue] = useState(props);
  const location = useSelector(getLocation);
  const isSegments = location.pathname?.startsWith("/admin/datamodel/segment");

  const onChange = useCallback(
    (value: TreePath, options?: ChangeOptions) => {
      setValue(value);

      // prevent auto-navigation from table-picker when Segments tab is open
      if (!isSegments) {
        if (options?.isAutomatic) {
          dispatch(replace(getUrl(value)));
        } else {
          dispatch(push(getUrl(value)));
        }
      }
    },
    [dispatch, isSegments],
  );

  useEffect(() => {
    setValue(props);
  }, [props]);

  return <TablePicker value={value} onChange={onChange} />;
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
  return <TablePicker value={value} onChange={handleChange} />;
}
