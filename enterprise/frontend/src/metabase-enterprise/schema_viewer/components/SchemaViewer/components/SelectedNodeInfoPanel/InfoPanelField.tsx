import cx from "classnames";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import CS from "metabase/css/core/index.css";
import {
  Ellipsified,
  FixedSizeIcon,
  Group,
  Loader,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { ErdField } from "metabase-types/api";

import type { SchemaViewerFlowNode } from "../../types";

import S from "./SelectedNodeInfoPanel.module.css";

type InfoPanelFieldProps = {
  field: ErdField;
  targetNode: SchemaViewerFlowNode | null;
  isExpanding: boolean;
  selectedNode: SchemaViewerFlowNode | null;
  onFetchExternal: () => void;
  onZoomToNode: (nodeId: string) => void;
};

export function InfoPanelField({
  field,
  targetNode,
  isExpanding,
  selectedNode,
  onFetchExternal,
  onZoomToNode,
}: InfoPanelFieldProps) {
  const fieldIcon = getColumnIcon(
    Lib.legacyColumnTypeInfo({
      base_type: field.base_type,
      effective_type: field.effective_type ?? undefined,
      semantic_type: field.semantic_type,
    }),
  );
  const isExternalFk = field.fk_target_table_id != null && targetNode == null;

  const fieldName = (
    <Ellipsified className={S.fieldName} maw={targetNode ? "50%" : "100%"}>
      {field.name}
    </Ellipsified>
  );

  return (
    <Group className={cx(S.fieldRow, CS.textWrap)} gap="sm" wrap="nowrap">
      <FixedSizeIcon name={fieldIcon} c="text-secondary" />
      {isExternalFk ? (
        <Tooltip
          label={t`Fetch external table`}
          disabled={isExpanding}
          position="left"
        >
          <UnstyledButton
            className={S.fkLink}
            c="core-brand"
            disabled={isExpanding}
            onClick={onFetchExternal}
            flex="0 1 auto"
            h="100%"
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
        <Group
          gap="xs"
          wrap="nowrap"
          flex="1 1 auto"
          h="100%"
          miw={0}
          maw="50%"
        >
          <Text c="text-disabled" lh={1} fz="1rem">
            →
          </Text>
          <UnstyledButton
            className={S.fkLink}
            c="core-brand"
            onClick={() => onZoomToNode(targetNode.id)}
          >
            <Group align="end" gap={4} flex="0 0 auto" wrap="nowrap" w="100%">
              <FixedSizeIcon name="table" size={14} />
              <Ellipsified>
                {formatTargetTableName(selectedNode, targetNode)}
              </Ellipsified>
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
