import { ngettext, msgid } from "ttag";
import React, { useMemo } from "react";

import Schemas from "metabase/entities/schemas";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { State } from "metabase-types/store";
import Schema from "metabase-lib/metadata/Schema";
import {
  NodeListItemLink,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
} from "./NodeList.styled";
import { PaneContent } from "./Pane.styled";

interface SchemaPaneProps {
  onBack: () => void;
  onClose: () => void;
  onItemClick: (type: string, item: unknown) => void;
  schema: Schema;
}

const SchemaPane = ({
  onBack,
  onClose,
  onItemClick,
  schema,
}: SchemaPaneProps) => {
  const tables = useMemo(
    () => schema.tables.sort((a, b) => a.name.localeCompare(b.name)),
    [schema.tables],
  );
  return (
    <SidebarContent
      title={schema.name}
      icon={"folder"}
      onBack={onBack}
      onClose={onClose}
    >
      <PaneContent>
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
            {tables.map(table => (
              <li key={table.id}>
                <NodeListItemLink onClick={() => onItemClick("table", table)}>
                  <NodeListItemIcon name="table" />
                  <NodeListItemName>{table.name}</NodeListItemName>
                </NodeListItemLink>
              </li>
            ))}
          </ul>
        </NodeListContainer>
      </PaneContent>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Schemas.load({
  id: (_state: State, props: SchemaPaneProps) => props.schema.id,
})(SchemaPane);
