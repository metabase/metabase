import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  Description,
  EmptyDescription,
} from "metabase/components/MetadataInfo/MetadataInfo";
import CS from "metabase/css/core/index.css";
import Tables from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import ConnectedTableList from "metabase/query_builder/components/dataref/ConnectedTableList";
import type Table from "metabase-lib/v1/metadata/Table";
import type { State } from "metabase-types/store";

import FieldList from "./FieldList";
import {
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemId,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";
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

function TablePane({ table, onItemClick, onBack, onClose }: TablePaneProps) {
  return (
    <SidebarContent
      title={table.name}
      icon={"table"}
      onBack={onBack}
      onClose={onClose}
    >
      <SidebarContent.Pane>
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
            {table.metrics?.length ? (
              <>
                <NodeListTitle>
                  <NodeListIcon name="metric" />
                  <NodeListTitleText>
                    {ngettext(
                      msgid`${table.metrics.length} metric`,
                      `${table.metrics.length} metrics`,
                      table.metrics.length,
                    )}
                  </NodeListTitleText>
                </NodeListTitle>
                <ul>
                  {table.metrics?.map(metric => (
                    <li key={metric.card().id}>
                      <NodeListItemLink
                        onClick={() => onItemClick("question", metric.card())}
                      >
                        <NodeListItemIcon name="metric" />
                        <NodeListItemName>
                          {metric.card().name}
                        </NodeListItemName>
                        <NodeListItemId>{`#${metric.id()}`}</NodeListItemId>
                      </NodeListItemLink>
                    </li>
                  ))}
                </ul>
                <br></br>
              </>
            ) : null}
          </div>
        </TableInfoLoader>
      </SidebarContent.Pane>
    </SidebarContent>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Tables.load({
    id: (_state: State, props: TablePaneProps) => props.table.id,
  }),
  connect(mapStateToProps),
)(TablePane);
