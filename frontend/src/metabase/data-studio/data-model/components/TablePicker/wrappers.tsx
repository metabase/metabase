import { useCallback, useEffect, useState } from "react";
import { replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

import type { RouteParams } from "../../pages/DataModel/types";

import { TablePicker } from "./components";
import type { TreePath } from "./types";

type Props = TreePath & {
  params: RouteParams;
  setOnUpdateCallback: (callback: (() => void) | null) => void;
};

export function RouterTablePicker({
  params,
  setOnUpdateCallback,
  ...props
}: Props) {
  const dispatch = useDispatch();
  const [value, setValue] = useState(props);
  const {
    databaseId: propDatabaseId,
    schemaName: propSchemaName,
    tableId: propTableId,
  } = props;

  const onChange = useCallback(
    (value: TreePath) => {
      setValue(value);
      dispatch(replace(Urls.dataStudioData(value)));
    },
    [dispatch],
  );

  useEffect(() => {
    setValue((currentValue) => {
      if (
        currentValue.databaseId === propDatabaseId &&
        currentValue.schemaName === propSchemaName &&
        currentValue.tableId === propTableId
      ) {
        return currentValue;
      }

      return {
        databaseId: propDatabaseId,
        schemaName: propSchemaName,
        tableId: propTableId,
      };
    });
  }, [propDatabaseId, propSchemaName, propTableId]);

  return (
    <TablePicker
      path={value}
      onChange={onChange}
      params={params}
      setOnUpdateCallback={setOnUpdateCallback}
    />
  );
}

export function UncontrolledTablePicker({
  initialValue,
  onChange,
  params,
  setOnUpdateCallback,
}: {
  initialValue: TreePath;
  onChange?: (path: TreePath) => void;
  params: RouteParams;
  setOnUpdateCallback: (callback: (() => void) | null) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const handleChange = useCallback(
    (value: TreePath) => {
      onChange?.(value);
      setValue(value);
    },
    [onChange],
  );
  return (
    <TablePicker
      path={value}
      onChange={handleChange}
      params={params}
      setOnUpdateCallback={setOnUpdateCallback}
    />
  );
}
