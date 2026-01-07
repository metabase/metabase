import {
  Background,
  Controls,
  Handle,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { memo } from "react";
import { t } from "ttag";

import {
  Box,
  Card,
  FixedSizeIcon,
  Group,
  type IconName,
  Pill,
  Stack,
  TextInput,
} from "metabase/ui";

import { MAX_ZOOM, MIN_ZOOM } from "../../components/DependencyGraph/constants";

type StubNodeData = {
  label: string;
  typeLabel: string;
  icon: IconName;
  color: string;
  dependencyLabel: string;
  hasUpstream: boolean;
  hasDownstream: boolean;
};

type StubNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: StubNodeData;
};

const StubGraphNode = memo(function StubGraphNode({
  data,
}: NodeProps<StubNode>) {
  return (
    <>
      <Card p="lg" withBorder>
        <Stack gap="sm">
          <Group c={data.color} gap="xs">
            <FixedSizeIcon name={data.icon} />
            <Box fz="sm" fw="bold" lh="1rem">
              {data.typeLabel}
            </Box>
          </Group>
          <Box fw="bold" lh="1rem">
            {data.label}
          </Box>
        </Stack>
        <Stack mt="md" gap="sm" align="start">
          <Box c="text-secondary" fz="sm" lh="1rem">
            Dependencies
          </Box>
          <Pill fw="normal">{data.dependencyLabel}</Pill>
        </Stack>
      </Card>
      {data.hasUpstream && (
        <Handle type="source" position={Position.Left} isConnectable={false} />
      )}
      {data.hasDownstream && (
        <Handle type="target" position={Position.Right} isConnectable={false} />
      )}
    </>
  );
});

const NODE_TYPES = {
  stub: StubGraphNode,
};

const STUB_NODES: StubNode[] = [
  {
    id: "table:1",
    type: "stub",
    position: { x: 0, y: 0 },
    data: {
      label: "Orders",
      typeLabel: "Table",
      icon: "table",
      color: "var(--mb-color-brand)",
      dependencyLabel: "2 downstream",
      hasUpstream: false,
      hasDownstream: true,
    },
  },
  {
    id: "card:1",
    type: "stub",
    position: { x: 300, y: -100 },
    data: {
      label: "Monthly Revenue",
      typeLabel: "Model",
      icon: "model",
      color: "var(--mb-color-success)",
      dependencyLabel: "1 upstream · 1 downstream",
      hasUpstream: true,
      hasDownstream: true,
    },
  },
  {
    id: "card:2",
    type: "stub",
    position: { x: 300, y: 100 },
    data: {
      label: "Customer Metrics",
      typeLabel: "Model",
      icon: "model",
      color: "var(--mb-color-success)",
      dependencyLabel: "1 upstream · 1 downstream",
      hasUpstream: true,
      hasDownstream: true,
    },
  },
  {
    id: "card:3",
    type: "stub",
    position: { x: 600, y: 0 },
    data: {
      label: "Revenue Dashboard",
      typeLabel: "Question",
      icon: "insight",
      color: "var(--mb-color-warning)",
      dependencyLabel: "2 upstream",
      hasUpstream: true,
      hasDownstream: false,
    },
  },
];

const STUB_EDGES = [
  { id: "e1", source: "table:1", target: "card:1" },
  { id: "e2", source: "table:1", target: "card:2" },
  { id: "e3", source: "card:1", target: "card:3" },
  { id: "e4", source: "card:2", target: "card:3" },
];

export function DependencyGraphPagePreview() {
  return (
    <Stack h="100%">
      <Box style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={STUB_NODES}
          edges={STUB_EDGES}
          nodeTypes={NODE_TYPES}
          fitView
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          data-testid="dependency-graph-preview"
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
        >
          <Background />
          <Controls showInteractive={false} />
          <Panel position="top-left">
            <Group>
              <TextInput
                placeholder={t`Select an entity...`}
                value="Orders"
                readOnly
                disabled
                w={250}
              />
            </Group>
          </Panel>
        </ReactFlow>
      </Box>
    </Stack>
  );
}
