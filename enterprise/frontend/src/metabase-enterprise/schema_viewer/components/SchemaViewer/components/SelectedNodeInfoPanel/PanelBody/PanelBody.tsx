import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Stack, Text, Title } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { ConcreteTableId } from "metabase-types/api";

import { useSchemaViewerContext } from "../../../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../../../types";
import { getEdgeId } from "../../../utils";
import { InfoPanelField } from "../InfoPanelField";

import S from "./PanelBody.module.css";

type PanelBodyProps = {
  node: SchemaViewerFlowNode;
  nodes: SchemaViewerFlowNode[];
};

export function PanelBody({ node, nodes }: PanelBodyProps) {
  return (
    <Stack className={S.body} p="lg" gap="lg">
      <DescriptionSection node={node} />
      <OwnerSection node={node} />
      <FieldsSection node={node} nodes={nodes} />
    </Stack>
  );
}

type SectionProps = { node: SchemaViewerFlowNode };

function DescriptionSection({ node }: SectionProps) {
  const description = node.data.description ?? "";
  return (
    <Box
      className={CS.textWrap}
      c={description ? "text-primary" : "text-secondary"}
      lh="h4"
    >
      {description.length > 0 ? description : t`No description`}
    </Box>
  );
}

function OwnerSection({ node }: SectionProps) {
  const owner = node.data.owner;
  return (
    <Stack gap="xs" lh="1rem">
      <Title order={6}>{t`Owner`}</Title>
      {owner != null ? (
        <Text lh="h4">{getUserName(owner)}</Text>
      ) : (
        <Text lh="h4" c="text-secondary">{t`No owner`}</Text>
      )}
    </Stack>
  );
}

function FieldsSection({ node, nodes }: PanelBodyProps) {
  const { zoomToNode, expandToTable, expandingTableIds } =
    useSchemaViewerContext();

  const nodesByTableId = useMemo(() => {
    const map = new Map<ConcreteTableId, SchemaViewerFlowNode>();
    for (const n of nodes) {
      map.set(n.data.table_id, n);
    }
    return map;
  }, [nodes]);

  const fields = node.data.fields;
  const count = fields.length;
  return (
    <Stack gap="md" lh="1rem">
      <Title className={CS.textWrap} order={6}>
        {ngettext(msgid`${count} field`, `${count} fields`, count)}
      </Title>
      {fields.map((field) => {
        const targetNode =
          field.fk_target_table_id != null
            ? (nodesByTableId.get(field.fk_target_table_id) ?? null)
            : null;
        const isExternalFk =
          field.fk_target_table_id != null && targetNode == null;
        const isExpanding =
          isExternalFk &&
          field.fk_target_table_id != null &&
          expandingTableIds.has(field.fk_target_table_id);

        const handleFetchExternal = () => {
          if (field.fk_target_table_id == null) {
            return;
          }
          const candidateEdgeIds =
            field.fk_target_field_id != null
              ? [
                  getEdgeId(field.id, field.fk_target_field_id),
                  getEdgeId(field.fk_target_field_id, field.id),
                ]
              : undefined;
          expandToTable(field.fk_target_table_id, candidateEdgeIds);
        };

        return (
          <InfoPanelField
            key={field.id}
            field={field}
            targetNode={targetNode}
            isExpanding={isExpanding}
            selectedNode={node}
            onFetchExternal={handleFetchExternal}
            onZoomToNode={zoomToNode}
          />
        );
      })}
    </Stack>
  );
}
