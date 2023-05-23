import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
import Tables from "metabase/entities/tables";
import Table from "metabase-lib/metadata/Table";

import {
  Description,
  EmptyDescription,
  LoadingSpinner,
  AbsoluteContainer,
  Fade,
} from "../MetadataInfo.styled";
import { InfoContainer, MetadataContainer } from "./TableInfo.styled";
import ColumnCount from "./ColumnCount";
import ConnectedTables from "./ConnectedTables";

type OwnProps = {
  className?: string;
  tableId: Table["id"];
  onConnectedTableClick?: (table: Table) => void;
};

const mapStateToProps = (state: any, props: OwnProps): { table?: Table } => {
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

TableInfo.propTypes = {
  className: PropTypes.string,
  tableId: PropTypes.number.isRequired,
  table: PropTypes.instanceOf(Table),
  fetchForeignKeys: PropTypes.func.isRequired,
  fetchMetadata: PropTypes.func.isRequired,
};

type AllProps = OwnProps &
  ReturnType<typeof mapStateToProps> &
  typeof mapDispatchToProps;

function useDependentTableMetadata({
  tableId,
  table,
  fetchForeignKeys,
  fetchMetadata,
}: Pick<AllProps, "tableId" | "table" | "fetchForeignKeys" | "fetchMetadata">) {
  const isMissingFields = !table?.numFields();
  const isMissingFks = _.isEmpty(table?.fks);
  const shouldFetchMetadata = isMissingFields || isMissingFks;
  const [hasFetchedMetadata, setHasFetchedMetadata] = useState(
    !shouldFetchMetadata,
  );
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
