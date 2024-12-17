import { useEffect, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import Tables from "metabase/entities/tables";
import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
import { connect } from "metabase/lib/redux";
import type Table from "metabase-lib/v1/metadata/Table";

import {
  AbsoluteContainer,
  Description,
  EmptyDescription,
  Fade,
  LoadingSpinner,
} from "../MetadataInfo.styled";

import ColumnCount from "./ColumnCount";
import ConnectedTables from "./ConnectedTables";
import { InfoContainer, MetadataContainer } from "./TableInfo.styled";

export type TableInfoProps = {
  className?: string;
  tableId: Table["id"];
  onConnectedTableClick?: (table: Table) => void;
};

const mapStateToProps = (
  state: any,
  props: TableInfoProps,
): { table?: Table } => {
  return {
    table: Tables.selectors.getObject(state, {
      entityId: props.tableId,
    }) as Table,
  };
};

const mapDispatchToProps: {
  fetchForeignKeys: (args: { id: Table["id"] }) => Promise<any>;
  fetchMetadata: (args: { id: Table["id"] }) => Promise<any>;
} = {
  fetchForeignKeys: Tables.actions.fetchForeignKeys,
  fetchMetadata: Tables.actions.fetchMetadata,
};

type AllProps = TableInfoProps &
  ReturnType<typeof mapStateToProps> &
  typeof mapDispatchToProps;

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
  const fetchDependentData = useSafeAsyncFunction(() => {
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

export function TableInfo({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(TableInfo);
