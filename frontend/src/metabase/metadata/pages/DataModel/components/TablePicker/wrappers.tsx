import { useCallback, useEffect, useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";

import { TablePicker } from "./TablePicker";
import type { TreePath } from "./types";
import { getUrl } from "./utils";

export function RouterTablePicker(props: TreePath) {
  const dispatch = useDispatch();
  const [value, setValue] = useState(props);
  const onChange = useCallback(
    (value: TreePath) => {
      setValue(value);
      dispatch(push(getUrl(value)));
    },
    [dispatch],
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
