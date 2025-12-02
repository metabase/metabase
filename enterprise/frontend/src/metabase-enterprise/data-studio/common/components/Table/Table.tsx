import { Tree } from "metabase/common/components/tree";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";

import { Box, Card } from "metabase/ui";

import S from "./Table.module.css";
import { CSSProperties } from "react";

type Column = {
  id: string;
  width: CSSProperties["width"];
  name: string;
};

export function Table<T extends ITreeNodeItem>({
  data,
  columns,
  onSelect,
}: {
  data: T[];
  columns: Column[];
  onSelect: TreeNodeProps["onSelect"];
}) {
  const renderSection = (item: T) => {
    return (
      <>
        {columns.map((c) => {
          return (
            <Box
              key={`${c.id}-${item[c.id]}`}
              __vars={{ "--column-width": `${c.width}` }}
              className={S.Column}
            >
              {item[c.id]}
            </Box>
          );
        })}
      </>
    );
  };

  return (
    <Card withBorder p={0}>
      <Tree
        data={data}
        TreeNode={TreeNode}
        rightSection={renderSection}
        className={S.Table}
        inset={16}
        onSelect={onSelect}
      />
    </Card>
  );
}
