import { ngettext, msgid } from "ttag";
import React, { useMemo } from "react";
import Schemas from "metabase/entities/schemas";
import { State } from "metabase-types/store";
import Schema from "metabase-lib/lib/metadata/Schema";
import {
  NodeListItemLink,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
} from "./NodeList.styled";

interface SchemaPaneProps {
  show: (type: string, item: unknown) => void;
  schema: Schema;
}

const SchemaPaneInner = ({ show, schema }: SchemaPaneProps) => {
  const tables = useMemo(
    () => schema.tables.sort((a, b) => a.name.localeCompare(b.name)),
    [schema.tables],
  );
  if (!tables) {
    return null;
  }
  return (
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
            <NodeListItemLink onClick={() => show("table", table)}>
              <NodeListItemIcon name="table" />
              <NodeListItemName>{table.name}</NodeListItemName>
            </NodeListItemLink>
          </li>
        ))}
      </ul>
    </NodeListContainer>
  );
};

const SchemaPane = Schemas.load({
  id: (_state: State, { schema }: SchemaPaneProps) => schema.id,
})(SchemaPaneInner);

export default SchemaPane;
