import { msgid, ngettext, t } from "ttag";

import {
  useGetTableQueryMetadataQuery,
  useListTableForeignKeysQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Description,
  EmptyDescription,
} from "metabase/common/components/MetadataInfo/MetadataInfo";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import CS from "metabase/css/core/index.css";
import { useMetadataProvider } from "metabase/metadata-store";
import { getTableQueryAndColumns } from "metabase/querying/common/utils";
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
import type { DataReferencePaneProps, DataReferenceTableItem } from "./types";

export function TablePane({
  id,
  onItemClick,
  onBack,
  onClose,
}: DataReferencePaneProps<DataReferenceTableItem>) {
  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery({ id });
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const {
    data: foreignKeys,
    isLoading: isLoadingForeignKeys,
    error: foreignKeysError,
  } = useListTableForeignKeysQuery(id);

  if (table == null || foreignKeys == null) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoading || isLoadingForeignKeys}
        error={error ?? foreignKeysError}
      />
    );
  }

  const queryAndColumns = getTableQueryAndColumns(metadataProvider, table.id);

  const handleColumnClick = (columnIndex: number) => {
    onItemClick({ type: "field", tableId: table.id, columnIndex });
  };

  const connectedTables = foreignKeys
    .map((foreignKey) => foreignKey.origin?.table)
    .filter((table) => table != null);

  return (
    <SidebarContent
      title={table.name}
      icon={"table"}
      onBack={onBack}
      onClose={onClose}
    >
      <SidebarContent.Pane>
        <div className={CS.ml1}>
          {table.description ? (
            <Description>{table.description}</Description>
          ) : (
            <EmptyDescription>{t`No description`}</EmptyDescription>
          )}
        </div>
        <div className={CS.my2}>
          {queryAndColumns?.columns.length ? (
            <>
              <FieldList
                query={queryAndColumns.query}
                stageIndex={queryAndColumns.stageIndex}
                columns={queryAndColumns.columns}
                onColumnClick={handleColumnClick}
              />
              <ConnectedTableList
                tables={connectedTables}
                onTableClick={(table) => {
                  if (isConcreteTableId(table.id)) {
                    onItemClick({ type: "table", id: table.id });
                  }
                }}
              />
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
                {table.metrics.map((metric) => (
                  <li key={metric.id}>
                    <NodeListItemLink
                      onClick={() =>
                        onItemClick({ type: "question", id: metric.id })
                      }
                    >
                      <NodeListItemIcon name="metric" />
                      <NodeListItemName>{metric.name}</NodeListItemName>
                      <NodeListItemId>{`#${metric.id}`}</NodeListItemId>
                    </NodeListItemLink>
                  </li>
                ))}
              </ul>
              <br></br>
            </>
          ) : null}
        </div>
      </SidebarContent.Pane>
    </SidebarContent>
  );
}
