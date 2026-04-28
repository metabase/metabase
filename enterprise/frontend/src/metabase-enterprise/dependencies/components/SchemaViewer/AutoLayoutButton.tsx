import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import type { SchemaViewerFlowNode } from "./types";
import { getNodesWithPositions } from "./utils";

/**
 * Re-runs the default Dagre layout on all currently-displayed nodes. Rendered
 * inside ReactFlow so it can use {@link useReactFlow} to read and replace
 * node state imperatively (React Flow's fitView can only run inside the
 * provider).
 */
export function AutoLayoutButton() {
  const { getNodes, getEdges, setNodes, fitView } =
    useReactFlow<SchemaViewerFlowNode>();

  const handleClick = useCallback(() => {
    const currentNodes = getNodes();
    const currentEdges = getEdges();
    if (currentNodes.length === 0) {
      return;
    }
    const laidOut = getNodesWithPositions(currentNodes, currentEdges);
    setNodes(laidOut);
    fitView({ nodes: laidOut, duration: 500 });
  }, [getNodes, getEdges, setNodes, fitView]);

  return (
    <Button
      bg="background-primary"
      variant="default"
      leftSection={<Icon name="sparkles" />}
      onClick={handleClick}
    >
      {t`Auto-layout`}
    </Button>
  );
}
