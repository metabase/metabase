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
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type Table from "metabase-lib/metadata/Table";
import TableInfoLoader from "./TableInfoLoader";
import FieldList from "./FieldList";
import { PaneContent } from "./Pane.styled";

interface TablePaneProps {
  onBack: () => void;
  onClose: () => void;
  onItemClick: (type: string, item: unknown) => void;
  table: Table;
}

const mapStateToProps = (state: State, props: TablePaneProps) => ({
  table: Tables.selectors.getObject(state, { entityId: props.table.id }),
});

const TablePane = ({ table, onItemClick, onBack, onClose }: TablePaneProps) => (
  <SidebarContent
    title={table.name}
    icon={"table"}
    onBack={onBack}
    onClose={onClose}
  >
    <PaneContent>
      <TableInfoLoader table={table}>
        <div className="ml1">
          {table.description ? (
            <Description>{table.description}</Description>
          ) : (
            <EmptyDescription>{t`No description`}</EmptyDescription>
          )}
        </div>
        <div className="my2">
          {table.fields?.length ? (
            <>
              <FieldList
                fields={table.fields}
                onFieldClick={f => onItemClick("field", f)}
              />
              {table.connectedTables() && (
                <ConnectedTableList
                  tables={table.connectedTables()}
                  onTableClick={t => onItemClick("table", t)}
                />
              )}
            </>
          ) : null}
        </div>
      </TableInfoLoader>
    </PaneContent>
  </SidebarContent>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Tables.load({
    id: (_state: State, props: TablePaneProps) => props.table.id,
  }),
  connect(mapStateToProps),
)(TablePane);
