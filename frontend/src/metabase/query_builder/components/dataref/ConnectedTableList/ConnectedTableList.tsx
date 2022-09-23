// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import React from "react";
import PropTypes from "prop-types";
import { jt } from "ttag";

import Table from "metabase-lib/lib/metadata/Table";

import {
  FieldListItem,
  FieldListItemName,
  FieldListItemIcon,
  FieldListTitle,
  FieldListContainer,
  FieldListIcon,
  FieldListTitleText,
} from "../FieldList/FieldList.styled";

ConnectedTableList.propTypes = {
  table: PropTypes.instanceOf(Table).isRequired,
};

type Props = {
  tables: Table[];
  onTableClick?: (table: Table) => void;
};

function ConnectedTableList({ tables, onTableClick }: Props) {
  return tables.length ? (
    <FieldListContainer>
      <FieldListTitle>
        <FieldListIcon name="connections" size="14" />
        <FieldListTitleText>{jt`${tables.length} connections`}</FieldListTitleText>
      </FieldListTitle>
      {tables.map(table => (
        <FieldListItem key={table.id}>
          <a onClick={() => onTableClick(table)}>
            <FieldListItemIcon name="table" />
            <FieldListItemName>{table.displayName()}</FieldListItemName>
          </a>
        </FieldListItem>
      ))}
    </FieldListContainer>
  ) : null;
}

export default ConnectedTableList;
