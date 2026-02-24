import { type NodeProps, useReactFlow } from "@xyflow/react";
import cx from "classnames";
import { memo, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { getAccentColors } from "metabase/lib/colors/groups";
import {
  Anchor,
  Box,
  FixedSizeIcon,
  Group,
  Stack,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { isTypePK } from "metabase-lib/v1/types/utils/isa";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../constants";
import type { SchemaViewerFlowNode } from "../types";

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
  const headerColor = data.is_focal ? "brand" : "text-primary";
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
