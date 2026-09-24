import { type NodeProps, Position } from "@xyflow/react";
import cx from "classnames";
import { type CSSProperties, memo, useMemo, useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { Shine } from "../components/Shine";
import { useNodeBuilderContext } from "../context";
import { FILTER_COLOR } from "../graph";
import type { FilterFlowNode } from "../types";

import { NodeHandle } from "./NodeHandle";
import { NodeHeader } from "./NodeHeader";
import S from "./nodes.module.css";

type FilterNodeProps = NodeProps<FilterFlowNode>;

// Narrows whatever is wired into it. Clauses are kept on the block; the
// compiled query is used to edit them and to derive the next clause set.
export const FilterNode = memo(function FilterNode({
  id,
  data,
}: FilterNodeProps) {
  const {
    compiled,
    readOnly,
    onFiltersChange,
    onRemoveNode,
    onToggleCollapsed,
  } = useNodeBuilderContext();
  const isCollapsed = data.collapsed ?? false;
  const isActive = compiled.activeNodeIds.has(id);
  const stage = compiled.stagesByNodeId.get(id);
  const stageIndex = stage?.stageIndex ?? 0;
  const query = isActive ? (stage?.query ?? null) : null;
  const ownStart = stage?.filterStart ?? 0;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Only this block's clauses: everything before `ownStart` came from
  // upstream blocks and stays untouched.
  const filters = useMemo(
    () => (query ? Lib.filters(query, stageIndex).slice(ownStart) : []),
    [query, ownStart, stageIndex],
  );

  const storeFrom = (nextQuery: Lib.Query) => {
    onFiltersChange(id, Lib.filters(nextQuery, stageIndex).slice(ownStart));
  };

  const openPicker = (index: number | null) => {
    setEditingIndex(index);
    setIsPickerOpen(true);
  };

  const closePicker = () => {
    setIsPickerOpen(false);
    setEditingIndex(null);
  };

  const handleSelect = (clause: Lib.Filterable) => {
    if (!query) {
      return;
    }
    const target = editingIndex != null ? filters[editingIndex] : undefined;
    storeFrom(
      target
        ? Lib.replaceClause(query, stageIndex, target, clause)
        : Lib.filter(query, stageIndex, clause),
    );
    closePicker();
  };

  const subtitle = isActive
    ? t`${filters.length} filter(s)`
    : data.filters.length > 0
      ? t`${data.filters.length} filter(s) · not wired into the result`
      : t`Not wired into the result`;

  // CSS custom properties are not part of React's CSSProperties type.
  const nodeStyle = { "--node-color": FILTER_COLOR } as CSSProperties;

  return (
    <div
      className={cx(
        S.node,
        { [S.collapsed]: isCollapsed },
        { [S.draft]: !isActive },
      )}
      style={nodeStyle}
      data-testid="node-builder-filter-node"
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
      <Shine />
      <NodeHeader
        icon="filter"
        title={data.afterSummarize ? t`Filter results` : t`Filter`}
        subtitle={subtitle}
        isDraft={!isActive}
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
                {filters.map((filter, index) => (
                  <div key={index} className={S.clauseRow}>
                    <button
                      type="button"
                      className={S.clauseName}
                      title={
                        Lib.displayInfo(query, stageIndex, filter)
                          .longDisplayName
                      }
                      disabled={readOnly}
                      onClick={() => openPicker(index)}
                    >
                      {
                        Lib.displayInfo(query, stageIndex, filter)
                          .longDisplayName
                      }
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        className={S.clauseRemove}
                        aria-label={t`Remove`}
                        onClick={() =>
                          storeFrom(Lib.removeClause(query, stageIndex, filter))
                        }
                      >
                        <Icon name="close" size={10} />
                      </button>
                    )}
                  </div>
                ))}
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
                        {t`Add a filter`}
                      </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <FilterPicker
                        query={query}
                        stageIndex={stageIndex}
                        filter={
                          editingIndex != null
                            ? filters[editingIndex]
                            : undefined
                        }
                        filterIndex={
                          editingIndex != null
                            ? ownStart + editingIndex
                            : undefined
                        }
                        onSelect={handleSelect}
                        onClose={closePicker}
                      />
                    </Popover.Dropdown>
                  </Popover>
                )}
              </>
            ) : (
              <div className={S.draftHint}>
                {t`Wire a table or a join in to add filters, then wire the output onwards to the result.`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
