/* eslint-disable react/prop-types */
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { msgid, ngettext, t } from "ttag";
import { connect } from "react-redux";

import { useAsyncFunction } from "metabase/hooks/use-async-function";
import Table from "metabase-lib/lib/metadata/Table";
import Tables from "metabase/entities/tables";
import Link from "metabase/components/Link";

import {
  InfoContainer,
  Description,
  EmptyDescription,
  Label,
  LabelContainer,
} from "../MetadataInfo.styled";
import { InteractiveTableLabel } from "./TableInfo.styled";

TableInfo.propTypes = {
  className: PropTypes.string,
  tableId: PropTypes.number.isRequired,
  fetchForeignKeys: PropTypes.func.isRequired,
  fetchMetadata: PropTypes.func.isRequired,
  table: PropTypes.object.isRequired,
};

const mapStateToProps = (state, props) => {
  return {
    table: Tables.selectors.getObject(state, { entityId: props.tableId }),
  };
};

const mapDispatchToProps = {
  fetchForeignKeys: Tables.actions.fetchForeignKeys,
  fetchMetadata: Tables.actions.fetchMetadata,
};

function TableInfo({
  className,
  tableId,
  table,
  fetchForeignKeys,
  fetchMetadata,
}) {
  const [isReady, setIsReady] = useState(false);
  const fetchDependentData = useAsyncFunction(() => {
    return Promise.all([
      fetchForeignKeys({ id: tableId }),
      fetchMetadata({ id: tableId }),
    ]);
  }, [tableId, fetchForeignKeys, fetchMetadata]);

  useEffect(() => {
    fetchDependentData().then(() => {
      setIsReady(true);
    });
  }, [fetchDependentData]);

  const description = table.description;

  return isReady ? (
    <InfoContainer className={className}>
      {description ? (
        <Description>{description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <ColumnCount table={table} />
      <ConnectedTables table={table} />
    </InfoContainer>
  ) : null;
}

function ColumnCount({ table }) {
  const fieldCount = table.fields.length;
  return (
    <LabelContainer color="text-dark">
      <Label>
        {ngettext(
          msgid`${fieldCount} column`,
          `${fieldCount} columns`,
          fieldCount,
        )}
      </Label>
    </LabelContainer>
  );
}

function ConnectedTables({ table }) {
  const fks = table.fks || [];
  const fkTables = fks.map(fk => new Table(fk.origin.table));
  return fks.length ? (
    <React.Fragment>
      <LabelContainer color="text-dark">
        <Label>{t`Connected to these tables`}</Label>
      </LabelContainer>
      {fkTables.map(fkTable => {
        return (
          <Link
            key={fkTable.id}
            to={`/reference/databases/${fkTable.db_id}/tables/${fkTable.id}`}
          >
            <InteractiveTableLabel table={fkTable} />
          </Link>
        );
      })}
    </React.Fragment>
  ) : null;
}

export default connect(mapStateToProps, mapDispatchToProps)(TableInfo);
