import { t } from "ttag";

import type { Table } from "metabase-types/api";

import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";

interface ConnectedTableListProps {
  tables: Table[];
  onTableClick: (table: Table) => void;
}

export const ConnectedTableList = ({
  tables,
  onTableClick,
}: ConnectedTableListProps) => (
  <NodeListContainer>
    <NodeListTitle>
      <NodeListIcon name="connections" size="14" />
      <NodeListTitleText>{t`${tables.length} connections`}</NodeListTitleText>
    </NodeListTitle>
    {tables.map((table) => (
      <li key={table.id}>
        <NodeListItemLink onClick={() => onTableClick(table)}>
          <NodeListItemIcon name="table" />
          <NodeListItemName>{table.display_name}</NodeListItemName>
        </NodeListItemLink>
      </li>
    ))}
  </NodeListContainer>
);
