import { useCallback, useContext, useEffect, useState } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { DataModelContext } from "metabase/metadata/pages/shared/DataModelContext";
import { getLocation } from "metabase/selectors/routing";

import type { RouteParams } from "../../pages/DataModel/types";

import { TablePicker } from "./components";
import type { ChangeOptions, TreePath } from "./types";
import { getUrl } from "./utils";

type Props = TreePath & {
  params: RouteParams;
  setOnUpdateCallback: (callback: (() => void) | null) => void;
  onUpdate: () => void;
};

export function RouterTablePicker({
  params,
  setOnUpdateCallback,
  onUpdate,
  ...props
}: Props) {
  const dispatch = useDispatch();
  const [value, setValue] = useState(props);
  const location = useSelector(getLocation);
  const { baseUrl } = useContext(DataModelContext);
  const isSegments = location.pathname?.startsWith(`${baseUrl}/segment`);
  const {
    databaseId: propDatabaseId,
    schemaName: propSchemaName,
    tableId: propTableId,
  } = props;

  const onChange = useCallback(
    (value: TreePath, options?: ChangeOptions) => {
      setValue(value);

      // Update URL only when either opening a table or no table has been opened yet.
      // We want to keep user looking at a table when navigating databases/schemas.
      const canUpdateUrl = value.tableId != null || propTableId == null;

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
    [dispatch, baseUrl, isSegments, propTableId],
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
      onUpdate={onUpdate}
    />
  );
}

export function UncontrolledTablePicker({
  initialValue,
  onChange,
  params,
  onUpdate,
  setOnUpdateCallback,
}: {
  initialValue: TreePath;
  onChange?: (path: TreePath) => void;
  params: RouteParams;
  setOnUpdateCallback: (callback: (() => void) | null) => void;
  onUpdate: () => void;
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
      onUpdate={onUpdate}
      setOnUpdateCallback={setOnUpdateCallback}
    />
  );
}
