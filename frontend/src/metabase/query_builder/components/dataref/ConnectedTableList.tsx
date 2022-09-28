import React from "react";
import { jt } from "ttag";

import Table from "metabase-lib/lib/metadata/Table";

import {
  NodeListItem,
  NodeListItemName,
  NodeListItemIcon,
  NodeListTitle,
  NodeListContainer,
  NodeListIcon,
  NodeListTitleText,
} from "./NodeList.styled";

type Props = {
  tables: Table[];
  onTableClick: (table: Table) => void;
};

function ConnectedTableList({ tables, onTableClick }: Props) {
  return (
    <NodeListContainer>
      <NodeListTitle>
        <NodeListIcon name="connections" size="14" />
        <NodeListTitleText>{jt`${tables.length} connections`}</NodeListTitleText>
      </NodeListTitle>
      {tables.map(table => (
        <NodeListItem key={table.id}>
          <a onClick={() => onTableClick(table)}>
            <NodeListItemIcon name="table" />
            <NodeListItemName>{table.displayName()}</NodeListItemName>
          </a>
        </NodeListItem>
      ))}
    </NodeListContainer>
  );
}

export default ConnectedTableList;
