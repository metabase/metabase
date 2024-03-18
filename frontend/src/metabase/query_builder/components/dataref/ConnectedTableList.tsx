import { t } from "ttag";

import type Table from "metabase-lib/v1/metadata/Table";

import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList.styled";

interface ConnectedTableListProps {
  tables: Table[];
  onTableClick: (table: Table) => void;
}

const ConnectedTableList = ({
  tables,
  onTableClick,
}: ConnectedTableListProps) => (
  <NodeListContainer>
    <NodeListTitle>
      <NodeListIcon name="connections" size="14" />
      <NodeListTitleText>{t`${tables.length} connections`}</NodeListTitleText>
    </NodeListTitle>
    {tables.map(table => (
      <li key={table.id}>
        <NodeListItemLink onClick={() => onTableClick(table)}>
          <NodeListItemIcon name="table" />
          <NodeListItemName>{table.displayName()}</NodeListItemName>
        </NodeListItemLink>
      </li>
    ))}
  </NodeListContainer>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ConnectedTableList;
