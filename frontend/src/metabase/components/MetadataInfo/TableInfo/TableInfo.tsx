import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";

import { useAsyncFunction } from "metabase/hooks/use-async-function";
import Tables from "metabase/entities/tables";
import Table from "metabase-lib/lib/metadata/Table";

import {
  InfoContainer,
  Description,
  EmptyDescription,
} from "../MetadataInfo.styled";
import {
  LoadingSpinner,
  AbsoluteContainer,
  Fade,
  Container,
} from "./TableInfo.styled";
import ColumnCount from "./ColumnCount";
import ConnectedTables from "./ConnectedTables";

type OwnProps = {
  className?: string;
  tableId: number;
};

const mapStateToProps = (state: any, props: OwnProps) => {
  return {
    table: Tables.selectors.getObject(state, {
      entityId: props.tableId,
    }) as Table,
  };
};

const mapDispatchToProps: {
  fetchForeignKeys: (args: { id: number }) => Promise<any>;
  fetchMetadata: (args: { id: number }) => Promise<any>;
} = {
  fetchForeignKeys: Tables.actions.fetchForeignKeys,
  fetchMetadata: Tables.actions.fetchMetadata,
};

TableInfo.propTypes = {
  className: PropTypes.string,
  tableId: PropTypes.number.isRequired,
  table: PropTypes.instanceOf(Table).isRequired,
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
}: Omit<AllProps, "className">) {
  const shouldFetchMetadata = !table.numFields();
  const [hasFetchedMetadata, setHasFetchedMetadata] = useState(
    !shouldFetchMetadata,
  );
  const fetchDependentData = useAsyncFunction(() => {
    return Promise.all([
      fetchForeignKeys({ id: tableId }),
      fetchMetadata({ id: tableId }),
    ]);
  }, [tableId, fetchForeignKeys, fetchMetadata]);

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
}: AllProps): JSX.Element {
  const description = table.description;
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
      <Container>
        <Fade visible={!hasFetchedMetadata}>
          <AbsoluteContainer>
            <LoadingSpinner />
          </AbsoluteContainer>
        </Fade>
        <Fade visible={hasFetchedMetadata}>
          <ColumnCount table={table} />
        </Fade>
        <Fade visible={hasFetchedMetadata}>
          <ConnectedTables table={table} />
        </Fade>
      </Container>
    </InfoContainer>
  );
}

export default connect(mapStateToProps, mapDispatchToProps)(TableInfo);
