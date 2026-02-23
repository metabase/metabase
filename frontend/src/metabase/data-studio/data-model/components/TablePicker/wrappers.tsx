import { useCallback, useEffect, useState } from "react";

import * as Urls from "metabase/lib/urls";
import { useNavigation } from "metabase/routing";

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
  const { replace } = useNavigation();
  const [value, setValue] = useState(props);
  const {
    databaseId: propDatabaseId,
    schemaName: propSchemaName,
    tableId: propTableId,
  } = props;

  const onChange = useCallback(
    (value: TreePath) => {
      setValue(value);
      replace(Urls.dataStudioData(value));
    },
    [replace],
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
