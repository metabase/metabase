// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from "react";
import PropTypes from "prop-types";
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

ConnectedTableList.propTypes = {
  table: PropTypes.instanceOf(Table).isRequired,
};

type Props = {
  tables: Table[];
  onTableClick?: (table: Table) => void;
};

function ConnectedTableList({ tables, onTableClick }: Props) {
  return tables.length ? (
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
  ) : null;
}

export default ConnectedTableList;
