import { useState, useEffect } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import Tables from "metabase/entities/tables";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
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
  const [hasFetchedMetadata, setHasFetchedMetadata] = useState(
    !shouldFetchMetadata,
  );
  const fetchDependentData = useSafeAsyncFunction(() => {
    return Promise.all([
      isMissingFields && fetchMetadata({ id: table.id }),
      isMissingFks && fetchForeignKeys({ id: table.id }),
    ]);
  }, [fetchMetadata, table, isMissingFks, isMissingFields, fetchForeignKeys]);

  useEffect(() => {
    if (shouldFetchMetadata) {
      fetchDependentData().then(() => {
        setHasFetchedMetadata(true);
      });
    }
  }, [fetchDependentData, shouldFetchMetadata]);

  return hasFetchedMetadata;
}

export function TableInfoLoader({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(TableInfoLoader);
