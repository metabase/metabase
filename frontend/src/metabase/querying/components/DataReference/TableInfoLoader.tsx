import { useEffect, useState } from "react";
import { useAsyncFn } from "react-use";

import { connect } from "metabase/redux";
import type { Dispatch } from "metabase/redux/store";
import {
  fetchTableForeignKeys,
  fetchTableMetadata,
} from "metabase/redux/tables";
import type Table from "metabase-lib/v1/metadata/Table";

type OwnProps = {
  table: Table;
  children: JSX.Element[];
};

const mapDispatchToProps = (dispatch: Dispatch) => ({
  fetchForeignKeys: (args: { id: Table["id"] }) =>
    dispatch(fetchTableForeignKeys(args)),
  fetchMetadata: (args: { id: Table["id"] }) =>
    dispatch(fetchTableMetadata(args)),
});

type AllProps = OwnProps & ReturnType<typeof mapDispatchToProps>;

function useDependentTableMetadata({
  table,
  fetchForeignKeys,
  fetchMetadata,
}: Pick<AllProps, "table" | "fetchForeignKeys" | "fetchMetadata">) {
  const isMissingFields = !table.numFields();
  const isMissingFks = table.fks === undefined;
  const shouldFetchMetadata = isMissingFields || isMissingFks;
  const [hasFetchedMetadata, setHasFetchedMetadata] =
    useState(!shouldFetchMetadata);
  const tableId = table.id;
  const [, fetchDependentData] = useAsyncFn(() => {
    return Promise.all([
      isMissingFields && fetchMetadata({ id: tableId }),
      isMissingFks && fetchForeignKeys({ id: tableId }),
    ]);
  }, [fetchMetadata, tableId, isMissingFks, isMissingFields, fetchForeignKeys]);

  useEffect(() => {
    if (shouldFetchMetadata) {
      fetchDependentData().then(() => {
        setHasFetchedMetadata(true);
      });
    }
  }, [fetchDependentData, shouldFetchMetadata]);

  return hasFetchedMetadata;
}

export function TableInfoLoaderInner({
  table,
  fetchForeignKeys,
  fetchMetadata,
  children,
}: AllProps): JSX.Element | null {
  const hasFetchedMetadata = useDependentTableMetadata({
    table,
    fetchForeignKeys,
    fetchMetadata,
  });
  return hasFetchedMetadata ? <> {children} </> : null;
}

export const TableInfoLoader = connect(
  null,
  mapDispatchToProps,
)(TableInfoLoaderInner);
