import { useReactFlow } from "@xyflow/react";
import { useMemo } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Select } from "metabase/ui";

import type { GraphSelection, NodeType } from "../types";
import { getNodeIcon, getNodeLabel } from "../utils";

type GraphSelectInputProps = {
  nodes: NodeType[];
  onSelectionChange: (selection: GraphSelection | undefined) => void;
};

export function GraphSelectInput({
  nodes,
  onSelectionChange,
}: GraphSelectInputProps) {
  const { fitView } = useReactFlow();
  const data = useMemo(() => getSelectItems(nodes), [nodes]);

  const handleChange = (value: string | null) => {
    const selectedNode = nodes.find((node) => node.id === value);
    if (selectedNode != null) {
      fitView({ nodes: [selectedNode] });
      onSelectionChange({
        id: selectedNode.data.id,
        type: selectedNode.data.type,
      });
    }
  };

  return (
    <Select
      value={null}
      data={data}
      placeholder={t`Jump to an item on the graph`}
      leftSection={<FixedSizeIcon name="search" />}
      rightSection={<div />}
      nothingFoundMessage={t`Didn't find any results`}
      w="20rem"
      searchable
      onChange={handleChange}
    />
  );
}

function getSelectItems(nodes: NodeType[]) {
  return nodes.map((node) => ({
    value: node.id,
    label: getNodeLabel(node.data),
    icon: getNodeIcon(node.data),
  }));
}
