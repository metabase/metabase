import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import {
  Description,
  EmptyDescription,
} from "metabase/components/MetadataInfo/MetadataInfo.styled";
import CS from "metabase/css/core/index.css";
import Tables from "metabase/entities/tables";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import ConnectedTableList from "metabase/query_builder/components/dataref/ConnectedTableList";
import type Table from "metabase-lib/v1/metadata/Table";
import type { State } from "metabase-types/store";

import FieldList from "./FieldList";
import { PaneContent } from "./Pane.styled";
import TableInfoLoader from "./TableInfoLoader";

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
        <div className={CS.ml1}>
          {table.description ? (
            <Description>{table.description}</Description>
          ) : (
            <EmptyDescription>{t`No description`}</EmptyDescription>
          )}
        </div>
        <div className={CS.my2}>
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
