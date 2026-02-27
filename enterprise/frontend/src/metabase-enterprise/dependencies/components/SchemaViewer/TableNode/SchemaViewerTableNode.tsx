import {
  Handle,
  type NodeProps,
  Position,
  useEdges,
  useNodes,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import cx from "classnames";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { getAccentColors } from "metabase/lib/colors/groups";
import {
  Anchor,
  Box,
  FixedSizeIcon,
  Group,
  Icon,
  Stack,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { isTypePK } from "metabase-lib/v1/types/utils/isa";
import type { ErdField } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../constants";
import { useIsCompactMode } from "../SchemaViewerContext";
import type { SchemaViewerFlowNode, SchemaViewerNodeData } from "../types";

import { SchemaViewerFieldRow } from "./SchemaViewerFieldRow";
import S from "./SchemaViewerTableNode.module.css";

const ICON_COLORS = getAccentColors({ light: false, dark: false, gray: false });
const COLLAPSE_THRESHOLD = 10;
const COLLAPSED_FIELD_COUNT = 5;

type SchemaViewerTableNodeProps = NodeProps<SchemaViewerFlowNode>;

// Track which node is currently focused for double-click toggle
let focusedNodeId: string | null = null;

export const SchemaViewerTableNode = memo(function SchemaViewerTableNode({
  id,
  data,
}: SchemaViewerTableNodeProps) {
  const { fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const isCompactMode = useIsCompactMode();
  const headerColor = data.is_focal ? "brand" : "text-primary";

  // Force React Flow to recalculate handle positions when switching modes
  useEffect(() => {
    updateNodeInternals(id);
  }, [isCompactMode, id, updateNodeInternals]);
  const iconColor = ICON_COLORS[Number(data.table_id) % ICON_COLORS.length];

  const canCollapse = data.fields.length > COLLAPSE_THRESHOLD;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleDoubleClick = useCallback(() => {
    if (focusedNodeId === id) {
      // Already focused on this node, zoom out to fit all
      fitView({ duration: 300 });
      focusedNodeId = null;
    } else {
      // Focus on this node
      fitView({ nodes: [{ id }], duration: 300, padding: 0.5 });
      focusedNodeId = id;
    }
  }, [fitView, id]);

  // Find PK field IDs that are targets of self-referencing FKs
  const selfRefTargetIds = useMemo(() => {
    const pkIds = new Set(
      data.fields.filter((f) => isTypePK(f.semantic_type)).map((f) => f.id),
    );
    const targetIds = new Set<number>();
    for (const field of data.fields) {
      if (
        field.fk_target_field_id != null &&
        pkIds.has(field.fk_target_field_id)
      ) {
        targetIds.add(field.fk_target_field_id);
      }
    }
    return targetIds;
  }, [data.fields]);

  const tableDetailsUrl = `/data-studio/data/database/${data.db_id}/schema/${data.db_id}:${data.schema ?? ""}/table/${data.table_id}`;

  if (isCompactMode) {
    return (
      <CompactTableNode
        nodeId={id}
        data={data}
        iconColor={iconColor}
        selfRefTargetIds={selfRefTargetIds}
        onDoubleClick={handleDoubleClick}
      />
    );
  }

  const visibleFields =
    canCollapse && isCollapsed
      ? data.fields.slice(0, COLLAPSED_FIELD_COUNT)
      : data.fields;

  const hiddenFieldCount = data.fields.length - COLLAPSED_FIELD_COUNT;

  return (
    <Stack
      className={cx(S.card, { [S.focal]: data.is_focal })}
      gap={0}
      onDoubleClick={handleDoubleClick}
    >
      <Group className={S.header} gap={8} px={16} py={20} wrap="nowrap">
        <FixedSizeIcon name="table2" style={{ color: iconColor }} />
        <Box
          fz={17}
          c={headerColor}
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {data.name}
        </Box>
        <Tooltip
          label={t`View table details`}
          openDelay={TOOLTIP_OPEN_DELAY_MS}
        >
          <Anchor
            href={tableDetailsUrl}
            target="_blank"
            className={S.detailsLink}
            onClick={(e) => e.stopPropagation()}
          >
            <FixedSizeIcon name="external" c="text-tertiary" />
          </Anchor>
        </Tooltip>
      </Group>
      <Box className={S.fields}>
        {visibleFields.map((field) => (
          <SchemaViewerFieldRow
            key={field.id}
            field={field}
            isConnected={data.connectedFieldIds.has(field.id)}
            hasSelfRefTarget={selfRefTargetIds.has(field.id)}
          />
        ))}
      </Box>
      {canCollapse && (
        <UnstyledButton
          className={S.collapseButton}
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <Group gap={4} justify="center">
            <FixedSizeIcon
              name={isCollapsed ? "chevrondown" : "chevronup"}
              c="text-tertiary"
            />
            <Box c="text-tertiary" fz="sm">
              {isCollapsed
                ? t`Show ${hiddenFieldCount} more fields`
                : t`Show fewer fields`}
            </Box>
          </Group>
        </UnstyledButton>
      )}
    </Stack>
  );
});

// Compact node component - shown when zoom <= 0.5
interface CompactTableNodeProps {
  nodeId: string;
  data: SchemaViewerNodeData;
  iconColor: string;
  selfRefTargetIds: Set<number>;
  onDoubleClick: () => void;
}

function CompactTableNode({
  nodeId,
  data,
  iconColor,
  selfRefTargetIds,
  onDoubleClick,
}: CompactTableNodeProps) {
  const headerColor = data.is_focal ? "brand" : "text-primary";
  const edges = useEdges();
  const nodes = useNodes();

  // Build map of node ID to table name
  const nodeIdToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.id, node.data?.name as string);
    }
    return map;
  }, [nodes]);

  // Find connected tables with direction and cardinality
  // inbound = other table has FK pointing to this table (other is "many" side)
  // outbound = this table has FK pointing to other table (this is "many" side)
  const connectedTables = useMemo(() => {
    const outbound = new Map<string, "one" | "many">();
    const inbound = new Map<string, "one" | "many">();
    for (const edge of edges) {
      const relationship = edge.data?.relationship ?? "many-to-one";
      if (edge.source === nodeId && edge.target !== nodeId) {
        // Outbound: this table is source (FK holder), so this side is "many" for many-to-one
        // The other side (target) is always "one"
        outbound.set(edge.target, "one");
      }
      if (edge.target === nodeId && edge.source !== nodeId) {
        // Inbound: other table is source (FK holder)
        // For many-to-one, source side is "many"; for one-to-one, source is "one"
        const cardinality = relationship === "one-to-one" ? "one" : "many";
        inbound.set(edge.source, cardinality);
      }
    }
    const result: Array<{
      name: string;
      direction: "inbound" | "outbound";
      cardinality: "one" | "many";
    }> = [];
    for (const [id, cardinality] of outbound) {
      result.push({
        name: nodeIdToName.get(id) ?? id,
        direction: "outbound",
        cardinality,
      });
    }
    for (const [id, cardinality] of inbound) {
      if (!outbound.has(id)) {
        result.push({
          name: nodeIdToName.get(id) ?? id,
          direction: "inbound",
          cardinality,
        });
      }
    }
    return result.sort((a, b) => {
      // Sort by direction first (outbound before inbound), then by name
      if (a.direction !== b.direction) {
        return a.direction === "outbound" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [edges, nodeId, nodeIdToName]);

  // Collect all connected fields that need handles for edge routing
  const connectedFields = useMemo(() => {
    return data.fields.filter((field) => data.connectedFieldIds.has(field.id));
  }, [data.fields, data.connectedFieldIds]);

  const tooltipContent = (
    <Stack gap={4}>
      <Box fw="bold" c="inherit">
        {data.name}
      </Box>
      {connectedTables.length > 0 && (
        <Stack gap={2}>
          {connectedTables.map(({ name, direction, cardinality }) => {
            const isMany = cardinality === "many";
            const iconName = isMany
              ? "arrow_split"
              : direction === "outbound"
                ? "triangle_right"
                : "triangle_left";
            const rotation = isMany ? (direction === "outbound" ? 0 : -180) : 0;
            return (
              <Group key={name} gap={6} wrap="nowrap">
                <Icon
                  name={iconName}
                  size={10}
                  style={{
                    opacity: 0.8,
                    transform: rotation ? `rotate(${rotation}deg)` : undefined,
                  }}
                />
                <Box fz="sm" c="inherit" style={{ opacity: 0.8 }}>
                  {name}
                </Box>
              </Group>
            );
          })}
        </Stack>
      )}
    </Stack>
  );

  return (
    <Tooltip
      label={tooltipContent}
      openDelay={TOOLTIP_OPEN_DELAY_MS}
      position="top"
    >
      <Stack
        className={cx(S.card, S.compact, { [S.focal]: data.is_focal })}
        gap={0}
        onDoubleClick={onDoubleClick}
      >
        <Group className={S.compactHeader} gap={12} px={16} wrap="nowrap">
          <FixedSizeIcon name="table2" size={24} style={{ color: iconColor }} />
          <Box
            fz={34}
            c={headerColor}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {data.name}
          </Box>
        </Group>
        {/* Handles at bottom for edge connections - same IDs as full mode */}
        <CompactHandles
          connectedFields={connectedFields}
          selfRefTargetIds={selfRefTargetIds}
        />
      </Stack>
    </Tooltip>
  );
}

// Render handles in compact mode - positioned at node edges
interface CompactHandlesProps {
  connectedFields: ErdField[];
  selfRefTargetIds: Set<number>;
}

function CompactHandles({
  connectedFields,
  selfRefTargetIds,
}: CompactHandlesProps) {
  return (
    <div className={S.compactHandles}>
      {connectedFields.map((field) => {
        const isPK =
          field.semantic_type === "type/PK" || field.semantic_type === "PK";
        const isFK =
          field.semantic_type === "type/FK" || field.semantic_type === "FK";

        return (
          <Fragment key={field.id}>
            {/* FK source handle - at bottom in compact mode */}
            {isFK && (
              <Handle
                type="source"
                position={Position.Bottom}
                id={`field-${field.id}`}
                className={S.compactHandle}
              />
            )}
            {/* PK target handle - at bottom in compact mode */}
            {isPK && (
              <Handle
                type="target"
                position={Position.Bottom}
                id={`field-${field.id}`}
                className={S.compactHandle}
              />
            )}
            {/* Self-ref PK target handle - at bottom in compact mode */}
            {isPK && selfRefTargetIds.has(field.id) && (
              <Handle
                type="target"
                position={Position.Bottom}
                id={`field-${field.id}-right`}
                className={S.compactHandle}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
