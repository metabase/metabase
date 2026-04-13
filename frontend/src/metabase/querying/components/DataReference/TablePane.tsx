import { msgid, ngettext, t } from "ttag";

import { useGetTableQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Description,
  EmptyDescription,
} from "metabase/common/components/MetadataInfo/MetadataInfo";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import CS from "metabase/css/core/index.css";
import { getMetadata } from "metabase/selectors/metadata";
import { useSelector } from "metabase/utils/redux";
import { isConcreteTableId } from "metabase-types/api";

import { ConnectedTableList } from "./ConnectedTableList";
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
import type { DataReferencePaneProps, DataReferenceTableItem } from "./types";

export function TablePane({
  id,
  onItemClick,
  onBack,
  onClose,
}: DataReferencePaneProps<DataReferenceTableItem>) {
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
                  onFieldClick={(field) => {
                    onItemClick({
                      type: "field",
                      id:
                        typeof field.id === "number"
                          ? field.id
                          : field.getUniqueId(),
                    });
                  }}
                />
                {table.connectedTables() && (
                  <ConnectedTableList
                    tables={table.connectedTables()}
                    onTableClick={(table) => {
                      if (isConcreteTableId(table.id)) {
                        onItemClick({ type: "table", id: table.id });
                      }
                    }}
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
                        onClick={() =>
                          onItemClick({
                            type: "question",
                            id: metric.card().id,
                          })
                        }
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
