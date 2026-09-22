import { createSelector } from "@reduxjs/toolkit";
import { useEffect, useState } from "react";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

import {
  getShallowTableFieldIds,
  getShallowTableForeignKeys,
  getShallowTables,
} from "metabase/metadata-store";
import { connect } from "metabase/redux";
import type { Dispatch, State } from "metabase/redux/store";
import {
  fetchTableForeignKeys,
  fetchTableMetadata,
} from "metabase/redux/tables";
import { Loader } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type { NormalizedTable, TableId } from "metabase-types/api";

import { Description, EmptyDescription } from "../MetadataInfo";
import { AbsoluteContainer, Fade } from "../MetadataInfo.styled";

import { ColumnCount } from "./ColumnCount";
import { type ConnectedTable, ConnectedTables } from "./ConnectedTables";
import { InfoContainer, MetadataContainer } from "./TableInfo.styled";

export type TableInfoProps = {
  className?: string;
  tableId: TableId;
  onConnectedTableClick?: (table: ConnectedTable) => void;
};

/**
 * The tables whose foreign keys point at this one. `undefined` until the
 * table's foreign keys are loaded.
 */
const getConnectedTables = createSelector(
  [
    (state: State, tableId: TableId) =>
      getShallowTableForeignKeys(state, tableId),
    (state: State) => getShallowTables(state),
  ],
  (foreignKeys, tables) =>
    foreignKeys
      ?.map((foreignKey) => tables[foreignKey.origin.table_id])
      .filter(isNotNull),
);

const mapStateToProps = (
  state: State,
  props: TableInfoProps,
): {
  table?: NormalizedTable;
  fieldCount: number;
  connectedTables?: NormalizedTable[];
} => {
  return {
    table: getShallowTables(state)[props.tableId],
    fieldCount: getShallowTableFieldIds(state, props.tableId).length,
    connectedTables: getConnectedTables(state, props.tableId),
  };
};

const mapDispatchToProps = (dispatch: Dispatch) => ({
  fetchForeignKeys: (args: { id: TableId }) =>
    dispatch(fetchTableForeignKeys(args)),
  fetchMetadata: (args: { id: TableId }) => dispatch(fetchTableMetadata(args)),
});

type AllProps = TableInfoProps &
  ReturnType<typeof mapStateToProps> &
  ReturnType<typeof mapDispatchToProps>;

function useDependentTableMetadata({
  tableId,
  fieldCount,
  connectedTables,
  fetchForeignKeys,
  fetchMetadata,
}: Pick<
  AllProps,
  | "tableId"
  | "fieldCount"
  | "connectedTables"
  | "fetchForeignKeys"
  | "fetchMetadata"
>) {
  const isMissingFields = fieldCount === 0;
  const isMissingFks = connectedTables === undefined;
  const shouldFetchMetadata = isMissingFields || isMissingFks;
  const [hasFetchedMetadata, setHasFetchedMetadata] =
    useState(!shouldFetchMetadata);
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

export function TableInfoInner({
  className,
  tableId,
  table,
  fieldCount,
  connectedTables,
  fetchForeignKeys,
  fetchMetadata,
  onConnectedTableClick,
}: AllProps): JSX.Element {
  const description = table?.description;
  const hasFetchedMetadata = useDependentTableMetadata({
    tableId,
    fieldCount,
    connectedTables,
    fetchForeignKeys,
    fetchMetadata,
  });

  return (
    <InfoContainer className={className}>
      {description ? (
        <Description>{description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <MetadataContainer>
        <Fade visible={!hasFetchedMetadata}>
          <AbsoluteContainer>
            <Loader size="md" color="core-brand" />
          </AbsoluteContainer>
        </Fade>
        <Fade visible={hasFetchedMetadata}>
          {table && <ColumnCount fieldCount={fieldCount} />}
        </Fade>
        <Fade visible={hasFetchedMetadata}>
          {table && (
            <ConnectedTables
              tables={connectedTables ?? []}
              onConnectedTableClick={onConnectedTableClick}
            />
          )}
        </Fade>
      </MetadataContainer>
    </InfoContainer>
  );
}

export const TableInfo = connect(
  mapStateToProps,
  mapDispatchToProps,
)(TableInfoInner);
