import type { NodeProps } from "@xyflow/react";
import cx from "classnames";
import { memo, useMemo } from "react";

import { getAccentColors } from "metabase/lib/colors/groups";
import { Box, FixedSizeIcon, Group, Stack } from "metabase/ui";
import { isTypePK } from "metabase-lib/v1/types/utils/isa";

import { SchemaViewerFieldRow } from "./SchemaViewerFieldRow";
import S from "./SchemaViewerTableNode.module.css";
import type { SchemaViewerFlowNode } from "../types";

const ICON_COLORS = getAccentColors({ light: false, dark: false, gray: false });

type SchemaViewerTableNodeProps = NodeProps<SchemaViewerFlowNode>;

export const SchemaViewerTableNode = memo(function SchemaViewerTableNode({
  data,
}: SchemaViewerTableNodeProps) {
  const headerColor = data.is_focal ? "brand" : "text-primary";
  const iconColor = ICON_COLORS[Number(data.table_id) % ICON_COLORS.length];

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

  return (
    <Stack className={cx(S.card, { [S.focal]: data.is_focal })} gap={0}>
      <Group className={S.header} gap={8} px={16} py={20} wrap="nowrap">
        <FixedSizeIcon name="table2" style={{ color: iconColor }} />
        <Box
          fz={17}
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
      <Box className={S.fields}>
        {data.fields.map((field) => (
          <SchemaViewerFieldRow
            key={field.id}
            field={field}
            isConnected={data.connectedFieldIds.has(field.id)}
            hasSelfRefTarget={selfRefTargetIds.has(field.id)}
          />
        ))}
      </Box>
    </Stack>
  );
});
