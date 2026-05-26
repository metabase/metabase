import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import {
  Box,
  FixedSizeIcon,
  Group,
  Loader,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { ErdField, Field } from "metabase-types/api";

import type { SchemaViewerFlowNode } from "../../types";

import S from "./SelectedNodeInfoPanel.module.css";

type InfoPanelFieldProps = {
  field: Field;
  erdField: ErdField | null;
  targetNode: SchemaViewerFlowNode | null;
  isExpanding: boolean;
  selectedNode: SchemaViewerFlowNode | null;
  onFetchExternal: () => void;
  onZoomToNode: (nodeId: string) => void;
};

export function InfoPanelField({
  field,
  erdField,
  targetNode,
  isExpanding,
  selectedNode,
  onFetchExternal,
  onZoomToNode,
}: InfoPanelFieldProps) {
  const fieldIcon = getColumnIcon(Lib.legacyColumnTypeInfo(field));
  const isExternalFk =
    erdField?.fk_target_table_id != null && targetNode == null;

  const fieldName = <Box className={S.fieldName}>{field.display_name}</Box>;

  return (
    <Group className={S.fieldRow} gap="sm" wrap="nowrap">
      <FixedSizeIcon name={fieldIcon} c="text-secondary" />
      {isExternalFk ? (
        <Tooltip label={t`Fetch external table`} disabled={isExpanding}>
          <UnstyledButton
            className={S.fkLink}
            c="brand"
            disabled={isExpanding}
            onClick={onFetchExternal}
          >
            {fieldName}
          </UnstyledButton>
        </Tooltip>
      ) : (
        fieldName
      )}
      {isExpanding && (
        <Loader size="xs" data-testid="schema-viewer-info-panel-fetch-loader" />
      )}
      {targetNode != null && (
        <Group gap="xs" wrap="nowrap" flex="1 1 auto" h="100%" miw={0}>
          <Text c="text-tertiary" lh={1} fz="1rem">
            →
          </Text>
          <UnstyledButton
            className={S.fkLink}
            c="brand"
            onClick={() => onZoomToNode(targetNode.id)}
          >
            <Group gap={4} wrap="nowrap" style={{ alignItems: "end" }} w="100%">
              <FixedSizeIcon name="table" size={14} />
              <span className={S.targetName}>
                {formatTargetTableName(selectedNode, targetNode)}
              </span>
            </Group>
          </UnstyledButton>
        </Group>
      )}
    </Group>
  );
}

function formatTargetTableName(
  selectedNode: SchemaViewerFlowNode | null,
  targetNode: SchemaViewerFlowNode,
): string {
  const targetName = targetNode.data.name;
  const targetSchema = targetNode.data.schema;
  const sourceSchema = selectedNode?.data.schema ?? null;
  const isExternalSchema =
    targetSchema != null &&
    targetSchema !== "" &&
    targetSchema !== sourceSchema;
  return isExternalSchema ? `${targetSchema}.${targetName}` : targetName;
}
