import { useCallback, useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";

import { TablePicker } from "./TablePicker";
import type { TreePath } from "./types";
import { getUrl } from "./utils";

export function RouterTablePicker(props: TreePath) {
  const dispatch = useDispatch();
  const onChange = useCallback(
    (value: TreePath) => {
      dispatch(push(getUrl(value)));
    },
    [dispatch],
  );
  return <TablePicker value={props} onChange={onChange} />;
}

export function UncontrolledTablePicker({
  initialValue,
  onChange: onChange_,
}: {
  initialValue: TreePath;
  onChange?: (path: TreePath) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const onChange = useCallback(
    (value: TreePath) => {
      onChange_?.(value);
      setValue(value);
    },
    [onChange_],
  );
  return <TablePicker value={value} onChange={onChange} />;
}
