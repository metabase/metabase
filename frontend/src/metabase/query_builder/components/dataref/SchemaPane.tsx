import { useMemo } from "react";
import { msgid, ngettext } from "ttag";

import Schemas from "metabase/entities/schemas";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type { State } from "metabase-types/store";

import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";

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
    () => schema.getTables().sort((a, b) => a.name.localeCompare(b.name)),
    [schema],
  );
  return (
    <SidebarContent
      title={schema.name}
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
      </SidebarContent.Pane>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Schemas.load({
  id: (_state: State, props: SchemaPaneProps) => props.schema.id,
})(SchemaPane);
