import { useEffect, useState } from "react";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

import { connect } from "metabase/redux";
import type { Dispatch, State } from "metabase/redux/store";
import {
  fetchTableForeignKeys,
  fetchTableMetadata,
} from "metabase/redux/tables";
import { getMetadata } from "metabase/selectors/metadata";
import type Table from "metabase-lib/v1/metadata/Table";

import { Description, EmptyDescription } from "../MetadataInfo";
import {
  AbsoluteContainer,
  Fade,
  LoadingSpinner,
} from "../MetadataInfo.styled";

import { ColumnCount } from "./ColumnCount";
import { ConnectedTables } from "./ConnectedTables";
import { InfoContainer, MetadataContainer } from "./TableInfo.styled";

export type TableInfoProps = {
  className?: string;
  tableId: Table["id"];
  onConnectedTableClick?: (table: Table) => void;
};

const mapStateToProps = (
  state: State,
  props: TableInfoProps,
): { table?: Table } => {
  return {
    table: getMetadata(state).table(props.tableId) ?? undefined,
  };
};

const mapDispatchToProps = (dispatch: Dispatch) => ({
  fetchForeignKeys: (args: { id: Table["id"] }) =>
    dispatch(fetchTableForeignKeys(args)),
  fetchMetadata: (args: { id: Table["id"] }) =>
    dispatch(fetchTableMetadata(args)),
});

type AllProps = TableInfoProps &
  ReturnType<typeof mapStateToProps> &
  ReturnType<typeof mapDispatchToProps>;

function useDependentTableMetadata({
  tableId,
  table,
  fetchForeignKeys,
  fetchMetadata,
}: Pick<AllProps, "tableId" | "table" | "fetchForeignKeys" | "fetchMetadata">) {
  const isMissingFields = !table?.numFields();
  const isMissingFks = table?.fks === undefined;
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
  fetchForeignKeys,
  fetchMetadata,
  onConnectedTableClick,
}: AllProps): JSX.Element {
  const description = table?.description;
  const hasFetchedMetadata = useDependentTableMetadata({
    tableId,
    table,
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
            <LoadingSpinner size={24} />
          </AbsoluteContainer>
        </Fade>
        <Fade visible={hasFetchedMetadata}>
          {table && <ColumnCount table={table} />}
        </Fade>
        <Fade visible={hasFetchedMetadata}>
          {table && (
            <ConnectedTables
              table={table}
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
