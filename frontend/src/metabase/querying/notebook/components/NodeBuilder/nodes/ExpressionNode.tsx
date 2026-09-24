import { type NodeProps, Position } from "@xyflow/react";
import cx from "classnames";
import { type CSSProperties, memo, useMemo, useState } from "react";
import { t } from "ttag";

import {
  ExpressionWidget,
  useExpressionWidgetChunk,
} from "metabase/querying/components/expressions/ExpressionWidget";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import { useNodeBuilderContext } from "../context";
import { EXPRESSION_COLOR } from "../graph";
import type { ExpressionFlowNode } from "../types";

import { NodeHandle } from "./NodeHandle";
import { NodeHeader } from "./NodeHeader";
import S from "./nodes.module.css";

type ExpressionNodeProps = NodeProps<ExpressionFlowNode>;

// Adds custom columns to whatever is wired into it. The named clauses are
// kept on the block; the compiled query is used to edit them.
export const ExpressionNode = memo(function ExpressionNode({
  id,
  data,
}: ExpressionNodeProps) {
  const {
    compiled,
    readOnly,
    onExpressionsChange,
    onRemoveNode,
    onToggleCollapsed,
  } = useNodeBuilderContext();
  const isCollapsed = data.collapsed ?? false;
  const isActive = compiled.activeNodeIds.has(id);
  const stage = compiled.stagesByNodeId.get(id);
  const stageIndex = stage?.stageIndex ?? 0;
  const query = stage?.query ?? null;
  const ownStart = stage?.expressionStart ?? 0;
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const isWidgetLoaded = useExpressionWidgetChunk();

  // Only this block's columns: everything before `ownStart` came from
  // upstream blocks and stays untouched.
  const expressions = useMemo(
    () => (query ? Lib.expressions(query, stageIndex).slice(ownStart) : []),
    [query, ownStart, stageIndex],
  );

  const storeFrom = (nextQuery: Lib.Query) => {
    onExpressionsChange(
      id,
      Lib.expressions(nextQuery, stageIndex)
        .slice(ownStart)
        .map((clause) => ({
          name: Lib.displayInfo(nextQuery, stageIndex, clause).displayName,
          clause,
        })),
    );
  };

  const openEditor = (index: number | null) => {
    setEditingIndex(index);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingIndex(null);
  };

  const editing = editingIndex != null ? expressions[editingIndex] : undefined;
  const editingPosition =
    editingIndex != null ? ownStart + editingIndex : undefined;

  const availableColumns = useMemo(
    () =>
      query
        ? Lib.expressionableColumns(query, stageIndex, editingPosition)
        : [],
    [query, stageIndex, editingPosition],
  );

  const handleChangeClause = (name: string, clause: Lib.ExpressionClause) => {
    if (!query) {
      return;
    }
    // Other columns keep their names; only the one being edited may reuse its own.
    const others = editing
      ? Lib.removeClause(query, stageIndex, editing)
      : query;
    const taken = Object.fromEntries(
      Lib.expressions(others, stageIndex).map((other) => [
        Lib.displayInfo(query, stageIndex, other).displayName,
      ]),
    );
    const uniqueName = getUniqueExpressionName(taken, name);
    const named = Lib.withExpressionName(clause, uniqueName);
    storeFrom(
      editing
        ? Lib.replaceClause(query, stageIndex, editing, named)
        : Lib.expression(query, stageIndex, uniqueName, named),
    );
    closeEditor();
  };

  const subtitle = isActive
    ? t`${expressions.length} column(s)`
    : data.expressions.length > 0
      ? t`${data.expressions.length} column(s) · not wired into the result`
      : t`Not wired into the result`;

  // CSS custom properties are not part of React's CSSProperties type.
  const nodeStyle = { "--node-color": EXPRESSION_COLOR } as CSSProperties;

  return (
    <div
      className={cx(
        S.node,
        { [S.collapsed]: isCollapsed },
        { [S.draft]: !query },
      )}
      style={nodeStyle}
      data-testid="node-builder-expression-node"
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
        icon="add_data"
        title={t`Custom column`}
        subtitle={subtitle}
        isDraft={!query}
        isCollapsed={isCollapsed}
        stageIndex={stageIndex}
        onToggleCollapsed={() => onToggleCollapsed(id)}
        onRemove={readOnly ? undefined : () => onRemoveNode(id)}
      />
      {!isCollapsed && (
        <div className={cx(S.utilityBody, "nodrag", "nowheel")}>
          {query ? (
            <>
              {expressions.map((clause, index) => {
                const info = Lib.displayInfo(query, stageIndex, clause);
                return (
                  <div key={index} className={S.clauseRow}>
                    <button
                      type="button"
                      className={S.clauseName}
                      title={info.longDisplayName}
                      disabled={readOnly}
                      onClick={() => openEditor(index)}
                    >
                      {info.longDisplayName}
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        className={S.clauseRemove}
                        aria-label={t`Remove`}
                        onClick={() =>
                          storeFrom(Lib.removeClause(query, stageIndex, clause))
                        }
                      >
                        <Icon name="close" size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
              {!readOnly && (
                <Popover
                  opened={isEditorOpen && isWidgetLoaded}
                  position="bottom-start"
                  onChange={(opened) => (opened ? undefined : closeEditor())}
                >
                  <Popover.Target>
                    <Button
                      variant="subtle"
                      size="compact-sm"
                      leftSection={<Icon name="add" size={10} />}
                      onClick={() => openEditor(null)}
                      style={{ alignSelf: "flex-start" }}
                    >
                      {t`Add a column`}
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <ExpressionWidget
                      query={query}
                      stageIndex={stageIndex}
                      expressionIndex={editingPosition}
                      availableColumns={availableColumns}
                      name={
                        editing
                          ? Lib.displayInfo(query, stageIndex, editing)
                              .displayName
                          : undefined
                      }
                      clause={editing}
                      withName
                      onChangeClause={handleChangeClause}
                      onClose={closeEditor}
                    />
                  </Popover.Dropdown>
                </Popover>
              )}
            </>
          ) : (
            <div className={S.draftHint}>
              {t`Wire a table or a join in to add custom columns, then wire the output onwards to the result.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
