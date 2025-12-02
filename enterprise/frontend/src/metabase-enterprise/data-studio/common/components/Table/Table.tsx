import _ from "underscore";
import cx from "classnames";

import { Tree } from "metabase/common/components/tree";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";

import { Badge, Box, Card, Flex, Icon, IconName } from "metabase/ui";

import S from "./Table.module.css";
import React, { CSSProperties } from "react";
import { useTreeSorting } from "./useTreeSorting";
import { SortDirection } from "metabase-types/api/sorting";

type Column = {
  id: string;
  width?: CSSProperties["width"];
  grow?: boolean;
  name: string;
};

export function Table<
  T extends Omit<ITreeNodeItem, "icon"> & { icon?: IconName },
>({
  data,
  columns,
  onSelect,
}: {
  data: T[];
  columns: Column[];
  onSelect: TreeNodeProps["onSelect"];
}) {
  const {
    sortedTree,
    sortColumn,
    sortDirection,
    setSortColumn,
    setSortDirection,
  } = useTreeSorting({
    data,
    defaultSortDirection: SortDirection.Asc,
    defaultSortColumn: columns[0].id,
    formatValueForSorting: (row, columnName) => row[columnName],
  });

  const handleHeaderClick = (columnId) => {
    if (columnId === sortColumn) {
      setSortDirection((s) =>
        s === SortDirection.Asc ? SortDirection.Desc : SortDirection.Asc,
      );
    } else {
      setSortColumn(columnId);
      setSortDirection(SortDirection.Asc);
    }
  };

  return (
    <Card withBorder p={0}>
      <Headers
        columns={columns}
        onHeaderClick={handleHeaderClick}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
      />
      <Tree
        data={sortedTree}
        TreeNode={(props: TreeNodeProps) => (
          <TableNode {...props} columns={columns} />
        )}
        className={S.Table}
        inset={16}
        onSelect={onSelect}
      />
    </Card>
  );
}

const Headers = ({
  columns,
  onHeaderClick,
  sortColumn,
  sortDirection,
}: {
  columns: Column[];
  onHeaderClick: (id: string) => void;
  sortColumn: string;
  sortDirection: SortDirection;
}) => {
  return (
    <Flex className={cx(S.Header, S.Row)} pl="2rem" py="md">
      {columns.map((c) => (
        <Box key={`header-${c.id}`} {...getColumnProps(c)}>
          <Badge
            onClick={() => onHeaderClick(c.id)}
            rightSection={
              sortColumn === c.id ? (
                <Icon
                  name={
                    sortDirection === SortDirection.Asc
                      ? "chevronup"
                      : "chevrondown"
                  }
                  size={10}
                />
              ) : null
            }
          >
            {c.name}
          </Badge>
        </Box>
      ))}
    </Flex>
  );
};

const TableNode = ({
  item,
  depth,
  isExpanded,
  hasChildren,
  onSelect,
  onToggleExpand,
  columns,
}: TreeNodeProps & { columns: Column[] }) => {
  const { name, icon } = item;

  const iconProps = _.isObject(icon) ? icon : { name: icon };

  function onClick() {
    onSelect?.();
    onToggleExpand();
  }

  const handleKeyDown: React.KeyboardEventHandler = ({ key }) => {
    switch (key) {
      case "Enter":
        onSelect?.();
        break;
      case "ArrowRight":
        !isExpanded && onToggleExpand();
        break;
      case "ArrowLeft":
        isExpanded && onToggleExpand();
        break;
    }
  };

  return (
    <Flex
      role="menuitem"
      align="center"
      aria-label={name}
      tabIndex={0}
      onClick={onClick}
      aria-expanded={isExpanded}
      onKeyDown={handleKeyDown}
      __vars={{
        "--row-indent": `${depth + 1}rem`,
      }}
      className={S.Row}
    >
      <TreeNode.ExpandToggleButton hidden={!hasChildren}>
        <TreeNode.ExpandToggleIcon
          isExpanded={isExpanded}
          name="chevronright"
          size={12}
        />
      </TreeNode.ExpandToggleButton>

      {icon && (
        <TreeNode.IconContainer transparent={false}>
          <Icon {...iconProps} />
        </TreeNode.IconContainer>
      )}
      {columns.map((c) => {
        return (
          <Box key={`${c.id}-${item[c.id]}`} {...getColumnProps(c)}>
            {item[c.id]}
          </Box>
        );
      })}
    </Flex>
  );
};

const getColumnProps = (c: Column) => {
  return {
    __vars: { "--column-width": `${c.width}` },
    className: cx(S.Column, { [S.Grow]: c.grow }),
  };
};
