import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { State } from "metabase-types/store";
import Tables from "metabase/entities/tables";
import {
  Description,
  EmptyDescription,
} from "metabase/components/MetadataInfo/MetadataInfo.styled";
import ConnectedTableList from "metabase/query_builder/components/dataref/ConnectedTableList";
import type Table from "metabase-lib/lib/metadata/Table";
import TableInfoLoader from "./TableInfoLoader";
import FieldList from "./FieldList";

const mapStateToProps = (state: State, props: TablePaneProps) => ({
  table: Tables.selectors.getObject(state, {
    entityId: props.table.id,
  }),
});

interface TablePaneProps {
  show: (type: string, item: unknown) => void;
  table: Table;
}

const TablePane = ({ table, show }: TablePaneProps) => {
  return table ? (
    <TableInfoLoader table={table}>
      <div className="ml1">
        {table.description ? (
          <Description>{table.description}</Description>
        ) : (
          <EmptyDescription>{t`No description`}</EmptyDescription>
        )}
      </div>
      <div className="my2">
        {table.fields && (
          <FieldList
            fields={table.fields}
            onFieldClick={f => show("field", f)}
          />
        )}
        {table.connectedTables() && (
          <ConnectedTableList
            tables={table.connectedTables()}
            onTableClick={t => show("table", t)}
          />
        )}
      </div>
    </TableInfoLoader>
  ) : null;
};

export default _.compose(
  Tables.load({
    id: (_state: State, props: TablePaneProps) => props.table.id,
    wrapped: true,
  }),
  connect(mapStateToProps),
)(TablePane);
