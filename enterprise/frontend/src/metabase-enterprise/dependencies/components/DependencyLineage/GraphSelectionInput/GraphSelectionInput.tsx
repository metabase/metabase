import { useNodes, useReactFlow } from "@xyflow/react";
import { useMemo } from "react";
import { t } from "ttag";

import { Icon, Select } from "metabase/ui";

import type { NodeType } from "../types";
import { getNodeIcon, getNodeLabel } from "../utils";

export function GraphSelectInput() {
  const nodes = useNodes<NodeType>();
  const { setNodes, fitView } = useReactFlow();
  const data = useMemo(() => getSelectItems(nodes), [nodes]);

  const handleChange = (value: string | null) => {
    const selectedNode = nodes.find((node) => node.id === value);
    if (selectedNode == null) {
      return;
    }

    setNodes((nodes) =>
      nodes.map((node) => ({ ...node, selected: node.id === selectedNode.id })),
    );
    fitView({ nodes: [selectedNode] });
  };

  return (
    <Select
      value={null}
      data={data}
      placeholder={t`Jump to an item on the graph`}
      leftSection={<Icon name="search" />}
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
