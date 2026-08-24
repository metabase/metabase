import { useCallback, useEffect, useState } from "react";

import { getIsNavigationPending, useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";

import type { RouteParams } from "../../pages/DataModel/types";

import { TablePicker } from "./components";
import type { ChangeOptions, TreePath } from "./types";

type Props = TreePath & {
  params: RouteParams;
  setOnUpdateCallback: (callback: ((path?: TreePath) => void) | null) => void;
};

export function RouterTablePicker({
  params,
  setOnUpdateCallback,
  ...props
}: Props) {
  const navigate = useNavigate();
  const [value, setValue] = useState(props);
  const {
    databaseId: propDatabaseId,
    schemaName: propSchemaName,
    tableId: propTableId,
  } = props;

  const onChange = useCallback(
    (value: TreePath, options?: ChangeOptions) => {
      setValue(value);

      // The tree selects a lone database, and then its lone schema, once its
      // data arrives. That mirrors into the URL long after the page opened, so
      // it can land while the user is already on their way to another page. A
      // `route.lazy` destination keeps this page mounted until its chunk
      // resolves, and this replace would take that pending navigation's place.
      // A pick the user made is theirs and still navigates.
      if (options?.isAutomatic && getIsNavigationPending()) {
        return;
      }

      navigate(Urls.dataStudioData(value), { replace: true });
    },
    [navigate],
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
  setOnUpdateCallback: (callback: ((path?: TreePath) => void) | null) => void;
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
