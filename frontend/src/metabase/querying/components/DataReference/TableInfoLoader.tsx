import { useEffect, useState } from "react";
import { useAsyncFn } from "react-use";

import { Tables } from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import type Table from "metabase-lib/v1/metadata/Table";

type OwnProps = {
  table: Table;
  children: JSX.Element[];
};

const mapDispatchToProps: {
  fetchForeignKeys: (args: { id: Table["id"] }) => Promise<any>;
  fetchMetadata: (args: { id: Table["id"] }) => Promise<any>;
} = {
  fetchForeignKeys: Tables.actions.fetchForeignKeys,
  fetchMetadata: Tables.actions.fetchMetadata,
};

type AllProps = OwnProps & typeof mapDispatchToProps;

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
