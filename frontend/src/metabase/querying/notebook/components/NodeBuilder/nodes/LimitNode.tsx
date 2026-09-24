import { type NodeProps, Position } from "@xyflow/react";
import cx from "classnames";
import {
  type CSSProperties,
  type KeyboardEvent,
  memo,
  useEffect,
  useState,
} from "react";
import { t } from "ttag";

import { TextInput } from "metabase/ui";

import { useNodeBuilderContext } from "../context";
import { LIMIT_COLOR } from "../graph";
import type { LimitFlowNode } from "../types";

import { NodeHandle } from "./NodeHandle";
import { NodeHeader } from "./NodeHeader";
import S from "./nodes.module.css";

type LimitNodeProps = NodeProps<LimitFlowNode>;

function formatLimit(limit: number | null) {
  return limit != null ? String(limit) : "";
}

// Caps the rows of whatever is wired into it. The number is kept on the block
// and applied to the compiled query.
export const LimitNode = memo(function LimitNode({ id, data }: LimitNodeProps) {
  const { compiled, readOnly, onLimitChange, onRemoveNode, onToggleCollapsed } =
    useNodeBuilderContext();
  const isCollapsed = data.collapsed ?? false;
  const isActive = compiled.activeNodeIds.has(id);
  const isCompiled = compiled.stagesByNodeId.has(id);
  const stageIndex = compiled.stagesByNodeId.get(id)?.stageIndex ?? 0;
  const [value, setValue] = useState(formatLimit(data.limit));

  useEffect(() => {
    setValue(formatLimit(data.limit));
  }, [data.limit]);

  const commit = () => {
    if (value.trim() === "") {
      onLimitChange(id, null);
      return;
    }
    const parsed = parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      onLimitChange(id, parsed);
    } else {
      setValue(formatLimit(data.limit));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  };

  const subtitle = !isActive
    ? t`Not wired into the result`
    : data.limit != null
      ? t`${data.limit} rows`
      : t`No limit set`;

  // CSS custom properties are not part of React's CSSProperties type.
  const nodeStyle = { "--node-color": LIMIT_COLOR } as CSSProperties;

  return (
    <div
      className={cx(
        S.node,
        { [S.collapsed]: isCollapsed },
        { [S.draft]: !isCompiled },
      )}
      style={nodeStyle}
      data-testid="node-builder-limit-node"
    >
      <NodeHandle
        type="target"
        position={Position.Left}
        id="in"
        isConnectable={!readOnly}
      />
      <NodeHandle
        type="source"
        position={Position.Right}
        id="out"
        isConnectable={!readOnly}
      />
      <NodeHeader
        icon="list"
        title={t`Limit`}
        subtitle={subtitle}
        isDraft={!isCompiled}
        isCollapsed={isCollapsed}
        stageIndex={stageIndex}
        onToggleCollapsed={() => onToggleCollapsed(id)}
        onRemove={readOnly ? undefined : () => onRemoveNode(id)}
      />
      {!isCollapsed && (
        <>
          <div className={cx(S.utilityBody, "nodrag", "nowheel")}>
            <TextInput
              type="number"
              min={1}
              size="xs"
              placeholder={t`Enter a row limit`}
              value={value}
              readOnly={readOnly}
              onChange={(event) => setValue(event.currentTarget.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
            />
            {!isActive && (
              <div className={S.draftHint}>
                {t`Wire a table or a join in, then wire the output onwards to the result.`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
