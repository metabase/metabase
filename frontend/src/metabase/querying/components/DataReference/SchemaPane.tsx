import { msgid, ngettext } from "ttag";

import { useListDatabaseSchemaTablesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { isConcreteTableId } from "metabase-types/api";

import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";
import type { DataReferencePaneProps, DataReferenceSchemaItem } from "./types";

type SchemaPaneProps = DataReferencePaneProps<DataReferenceSchemaItem>;

export const SchemaPane = ({
  onBack,
  onClose,
  onItemClick,
  schemaName,
  databaseId,
}: SchemaPaneProps) => {
  const {
    data: tables = [],
    isLoading,
    error,
  } = useListDatabaseSchemaTablesQuery({ id: databaseId, schema: schemaName });

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <SidebarContent
      title={schemaName}
      icon={"folder"}
      onBack={onBack}
      onClose={onClose}
    >
      <SidebarContent.Pane>
        <NodeListContainer>
          <NodeListTitle>
            <NodeListIcon name="table" />
            <NodeListTitleText>
              {ngettext(
                msgid`${tables.length} table`,
                `${tables.length} tables`,
                tables.length,
              )}
            </NodeListTitleText>
          </NodeListTitle>
          <ul>
            {tables.map(
              ({ id, name }) =>
                isConcreteTableId(id) && (
                  <li key={id}>
                    <NodeListItemLink
                      onClick={() => onItemClick({ type: "table", id })}
                    >
                      <NodeListItemIcon name="table" />
                      <NodeListItemName>{name}</NodeListItemName>
                    </NodeListItemLink>
                  </li>
                ),
            )}
          </ul>
        </NodeListContainer>
      </SidebarContent.Pane>
    </SidebarContent>
  );
};
