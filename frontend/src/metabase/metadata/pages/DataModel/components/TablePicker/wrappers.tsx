import { useCallback, useContext, useEffect, useState } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";

import { DataModelContext } from "../../DataModelContext";
import type { RouteParams } from "../../types";

import { TablePicker } from "./components";
import type { ChangeOptions, TreePath } from "./types";
import { getUrl } from "./utils";

export function RouterTablePicker(props: TreePath & { params: RouteParams }) {
  const dispatch = useDispatch();
  const [value, setValue] = useState(props);
  const location = useSelector(getLocation);
  const { baseUrl } = useContext(DataModelContext);
  const isSegments = location.pathname?.startsWith(`${baseUrl}/segment`);

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
            dispatch(replace(getUrl(baseUrl, value)));
          }
        } else {
          dispatch(push(getUrl(baseUrl, value)));
        }
      }
    },
    [dispatch, baseUrl, isSegments, props],
  );

  useEffect(() => {
    setValue(props);
  }, [props]);

  return <TablePicker path={value} onChange={onChange} params={props} />;
}

export function UncontrolledTablePicker({
  initialValue,
  onChange,
  params,
}: {
  initialValue: TreePath;
  onChange?: (path: TreePath) => void;
  params: RouteParams;
}) {
  const [value, setValue] = useState(initialValue);
  const handleChange = useCallback(
    (value: TreePath) => {
      onChange?.(value);
      setValue(value);
    },
    [onChange],
  );
  return <TablePicker path={value} onChange={handleChange} params={params} />;
}
