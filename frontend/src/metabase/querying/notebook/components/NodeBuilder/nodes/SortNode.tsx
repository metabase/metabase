import { type NodeProps, Position } from "@xyflow/react";
import cx from "classnames";
import { type CSSProperties, memo, useMemo, useState } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/querying/common/components/QueryColumnPicker";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useNodeBuilderContext } from "../context";
import { SORT_COLOR } from "../graph";
import type { SortFlowNode } from "../types";

import { NodeHandle } from "./NodeHandle";
import { NodeHeader } from "./NodeHeader";
import S from "./nodes.module.css";

type SortNodeProps = NodeProps<SortFlowNode>;

// Orders whatever is wired into it. Clauses are kept on the block; the
// compiled query is used to list columns and to derive the next clause set.
export const SortNode = memo(function SortNode({ id, data }: SortNodeProps) {
  const {
    compiled,
    readOnly,
    onOrderBysChange,
    onRemoveNode,
    onToggleCollapsed,
  } = useNodeBuilderContext();
  const isCollapsed = data.collapsed ?? false;
  const isActive = compiled.activeNodeIds.has(id);
  const stage = compiled.stagesByNodeId.get(id);
  const stageIndex = stage?.stageIndex ?? 0;
  const query = stage?.query ?? null;
  const ownStart = stage?.orderByStart ?? 0;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Only this block's clauses; anything before `ownStart` is upstream.
  const clauses = useMemo(
    () => (query ? Lib.orderBys(query, stageIndex).slice(ownStart) : []),
    [query, ownStart, stageIndex],
  );

  const columnGroups = useMemo(() => {
    if (!query) {
      return [];
    }
    const columns = Lib.orderableColumns(query, stageIndex).filter((column) => {
      const position = Lib.displayInfo(
        query,
        stageIndex,
        column,
      ).orderByPosition;
      return (
        position == null ||
        (editingIndex != null && position === ownStart + editingIndex)
      );
    });
    return Lib.groupColumns(columns);
  }, [query, editingIndex, ownStart, stageIndex]);

  const storeFrom = (nextQuery: Lib.Query) => {
    onOrderBysChange(id, Lib.orderBys(nextQuery, stageIndex).slice(ownStart));
  };

  const openPicker = (index: number | null) => {
    setEditingIndex(index);
    setIsPickerOpen(true);
  };

  const closePicker = () => {
    setIsPickerOpen(false);
    setEditingIndex(null);
  };

  const handleSelectColumn = (column: Lib.ColumnMetadata) => {
    if (!query) {
      return;
    }
    const clause = editingIndex != null ? clauses[editingIndex] : undefined;
    storeFrom(
      clause
        ? Lib.replaceClause(
            query,
            stageIndex,
            clause,
            Lib.orderByClause(column),
          )
        : Lib.orderBy(query, stageIndex, column, "asc"),
    );
    closePicker();
  };

  const subtitle = isActive
    ? t`${clauses.length} column(s)`
    : data.orderBys.length > 0
      ? t`${data.orderBys.length} column(s) · not wired into the result`
      : t`Not wired into the result`;

  // CSS custom properties are not part of React's CSSProperties type.
  const nodeStyle = { "--node-color": SORT_COLOR } as CSSProperties;

  return (
    <div
      className={cx(
        S.node,
        { [S.collapsed]: isCollapsed },
        { [S.draft]: !query },
      )}
      style={nodeStyle}
      data-testid="node-builder-sort-node"
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
        icon="sort"
        title={t`Sort`}
        subtitle={subtitle}
        isDraft={!query}
        isCollapsed={isCollapsed}
        stageIndex={stageIndex}
        onToggleCollapsed={() => onToggleCollapsed(id)}
        onRemove={readOnly ? undefined : () => onRemoveNode(id)}
      />
      {!isCollapsed && (
        <>
          <div className={cx(S.utilityBody, "nodrag", "nowheel")}>
            {query ? (
              <>
                {clauses.map((clause, index) => {
                  const info = Lib.displayInfo(query, stageIndex, clause);
                  return (
                    <div key={index} className={S.clauseRow}>
                      <button
                        type="button"
                        className={S.sortDirection}
                        aria-label={t`Change direction`}
                        disabled={readOnly}
                        onClick={() =>
                          storeFrom(Lib.changeDirection(query, clause))
                        }
                      >
                        <Icon
                          name={
                            info.direction === "asc" ? "arrow_up" : "arrow_down"
                          }
                          size={12}
                        />
                      </button>
                      <button
                        type="button"
                        className={S.clauseName}
                        title={info.longDisplayName}
                        disabled={readOnly}
                        onClick={() => openPicker(index)}
                      >
                        {info.longDisplayName}
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          className={S.clauseRemove}
                          aria-label={t`Remove`}
                          onClick={() =>
                            storeFrom(
                              Lib.removeClause(query, stageIndex, clause),
                            )
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
                    opened={isPickerOpen}
                    position="bottom-start"
                    onChange={(opened) => (opened ? undefined : closePicker())}
                  >
                    <Popover.Target>
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        leftSection={<Icon name="add" size={10} />}
                        onClick={() => openPicker(null)}
                        style={{ alignSelf: "flex-start" }}
                      >
                        {t`Add a column`}
                      </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <QueryColumnPicker
                        query={query}
                        stageIndex={stageIndex}
                        columnGroups={columnGroups}
                        color="text-primary"
                        checkIsColumnSelected={(item) =>
                          editingIndex != null &&
                          item.orderByPosition === ownStart + editingIndex
                        }
                        onSelect={handleSelectColumn}
                        onClose={closePicker}
                      />
                    </Popover.Dropdown>
                  </Popover>
                )}
              </>
            ) : (
              <div className={S.draftHint}>
                {t`Wire a table or a join in to pick the columns to sort by, then wire the output onwards to the result.`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
