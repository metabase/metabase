import { msgid, ngettext, t } from "ttag";

import { useGetTableQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Description,
  EmptyDescription,
} from "metabase/common/components/MetadataInfo/MetadataInfo";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { SidebarContent } from "metabase/query_builder/components/SidebarContent";
import { ConnectedTableList } from "metabase/query_builder/components/dataref/ConnectedTableList";
import { getMetadata } from "metabase/selectors/metadata";
import type { ConcreteTableId } from "metabase-types/api";

import { FieldList } from "./FieldList";
import {
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemId,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";
import { TableInfoLoader } from "./TableInfoLoader";

type TableItem = {
  id: ConcreteTableId;
};

type TablePaneProps = {
  table: TableItem;
  onBack: () => void;
  onClose: () => void;
  onItemClick: (type: string, item: unknown) => void;
};

export function TablePane({
  table: { id },
  onItemClick,
  onBack,
  onClose,
}: TablePaneProps) {
  const { isLoading, error } = useGetTableQuery({ id });
  const metadata = useSelector(getMetadata);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const table = metadata.table(id);
  if (table == null) {
    return <LoadingAndErrorWrapper loading />;
  }

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
                  onFieldClick={(f) => onItemClick("field", f)}
                />
                {table.connectedTables() && (
                  <ConnectedTableList
                    tables={table.connectedTables()}
                    onTableClick={(t) => onItemClick("table", t)}
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
                  {table.metrics?.map((metric) => (
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
