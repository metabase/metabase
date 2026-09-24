import { type NodeProps, Position } from "@xyflow/react";
import cx from "classnames";
import { type CSSProperties, memo, useMemo, useState } from "react";
import { t } from "ttag";

import { AggregationPicker } from "metabase/querying/common/components/AggregationPicker";
import { QueryColumnPicker } from "metabase/querying/common/components/QueryColumnPicker";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { Shine } from "../components/Shine";
import { useNodeBuilderContext } from "../context";
import { SUMMARIZE_COLOR } from "../graph";
import type { SummarizeFlowNode } from "../types";

import { NodeHandle } from "./NodeHandle";
import { NodeHeader } from "./NodeHeader";
import S from "./nodes.module.css";

type SummarizeNodeProps = NodeProps<SummarizeFlowNode>;

type Picker =
  | { kind: "metric"; index: number | null }
  | { kind: "breakout"; index: number | null }
  | null;

// Aggregates whatever is wired into it: metrics on top, grouping below.
// Clauses are kept on the block; the compiled query is used to edit them and
// to derive the next clause set.
export const SummarizeNode = memo(function SummarizeNode({
  id,
  data,
}: SummarizeNodeProps) {
  const {
    compiled,
    readOnly,
    isMetric,
    onSummarizeChange,
    onRemoveNode,
    onAddStageBlock,
    onToggleCollapsed,
  } = useNodeBuilderContext();
  const isCollapsed = data.collapsed ?? false;
  const isActive = compiled.activeNodeIds.has(id);
  const stage = compiled.stagesByNodeId.get(id);
  const stageIndex = stage?.stageIndex ?? 0;
  const query = isActive ? (stage?.query ?? null) : null;
  const aggregationStart = stage?.aggregationStart ?? 0;
  const breakoutStart = stage?.breakoutStart ?? 0;
  const orderByStart = stage?.orderByStart ?? 0;
  const [picker, setPicker] = useState<Picker>(null);

  // Only this block's clauses; anything before the starts is upstream.
  const aggregations = useMemo(
    () =>
      query ? Lib.aggregations(query, stageIndex).slice(aggregationStart) : [],
    [query, aggregationStart, stageIndex],
  );
  const breakouts = useMemo(
    () => (query ? Lib.breakouts(query, stageIndex).slice(breakoutStart) : []),
    [query, breakoutStart, stageIndex],
  );

  const editingAggregation =
    picker?.kind === "metric" && picker.index != null
      ? aggregations[picker.index]
      : undefined;
  // Index within the query's full breakout list, for the picker's selection.
  const editingBreakoutIndex =
    picker?.kind === "breakout" && picker.index != null
      ? breakoutStart + picker.index
      : undefined;
  const editingBreakout =
    picker?.kind === "breakout" && picker.index != null
      ? breakouts[picker.index]
      : undefined;

  const operators = useMemo(() => {
    if (!query) {
      return [];
    }
    const available = Lib.availableAggregationOperators(query, stageIndex);
    return editingAggregation
      ? Lib.selectedAggregationOperators(available, editingAggregation)
      : available;
  }, [query, editingAggregation, stageIndex]);

  const breakoutGroups = useMemo(() => {
    if (!query) {
      return [];
    }
    const columns = Lib.breakoutableColumns(query, stageIndex).flatMap(
      (column) => {
        const info = Lib.displayInfo(query, stageIndex, column);
        const isEditing =
          editingBreakout != null &&
          editingBreakoutIndex != null &&
          (info.breakoutPositions ?? []).includes(editingBreakoutIndex);
        if (!isEditing) {
          return [column];
        }
        const current = Lib.breakoutColumn(query, stageIndex, editingBreakout);
        return current ? [current] : [];
      },
    );
    return Lib.groupColumns(columns);
  }, [query, editingBreakout, editingBreakoutIndex, stageIndex]);

  const storeFrom = (nextQuery: Lib.Query) => {
    onSummarizeChange(
      id,
      Lib.aggregations(nextQuery, stageIndex).slice(aggregationStart),
      Lib.breakouts(nextQuery, stageIndex)
        .slice(breakoutStart)
        .map((breakout) => Lib.breakoutColumn(nextQuery, stageIndex, breakout))
        .filter((column): column is Lib.ColumnMetadata => column != null),
      // MLv2 drops the sorts that pointed at a removed metric or group; pass them on.
      Lib.orderBys(nextQuery, stageIndex).slice(orderByStart),
    );
  };

  const closePicker = () => setPicker(null);

  const handleSelectBreakout = (column: Lib.ColumnMetadata) => {
    if (!query) {
      return;
    }
    storeFrom(
      editingBreakout
        ? Lib.replaceClause(query, stageIndex, editingBreakout, column)
        : Lib.breakout(query, stageIndex, column),
    );
    closePicker();
  };

  const subtitle = isActive
    ? t`${aggregations.length} metric(s) · ${breakouts.length} group(s)`
    : data.aggregations.length + data.breakoutColumns.length > 0
      ? t`${data.aggregations.length} metric(s) · ${data.breakoutColumns.length} group(s) · not wired`
      : t`Not wired into the result`;

  // CSS custom properties are not part of React's CSSProperties type.
  const nodeStyle = { "--node-color": SUMMARIZE_COLOR } as CSSProperties;

  const renderRow = (
    key: number,
    label: string,
    onEdit: () => void,
    onRemove: () => void,
  ) => (
    <div key={key} className={S.clauseRow}>
      <button
        type="button"
        className={S.clauseName}
        title={label}
        disabled={readOnly}
        onClick={onEdit}
      >
        {label}
      </button>
      {!readOnly && (
        <button
          type="button"
          className={S.clauseRemove}
          aria-label={t`Remove`}
          onClick={onRemove}
        >
          <Icon name="close" size={10} />
        </button>
      )}
    </div>
  );

  return (
    <div
      className={cx(
        S.node,
        { [S.collapsed]: isCollapsed },
        { [S.draft]: !isActive },
      )}
      style={nodeStyle}
      data-testid="node-builder-summarize-node"
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
        isConnectable={false}
      />
      <Shine />
      <NodeHeader
        icon="sum"
        title={t`Summarize`}
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
                <span className={S.sectionLabel}>{t`Metrics`}</span>
                {aggregations.map((aggregation, index) =>
                  renderRow(
                    index,
                    Lib.displayInfo(query, stageIndex, aggregation)
                      .longDisplayName,
                    () => setPicker({ kind: "metric", index }),
                    () =>
                      storeFrom(
                        Lib.removeClause(query, stageIndex, aggregation),
                      ),
                  ),
                )}
                {!readOnly && (!isMetric || aggregations.length === 0) && (
                  <Popover
                    opened={picker?.kind === "metric"}
                    position="bottom-start"
                    onChange={(opened) => (opened ? undefined : closePicker())}
                  >
                    <Popover.Target>
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        leftSection={<Icon name="add" size={10} />}
                        onClick={() =>
                          setPicker({ kind: "metric", index: null })
                        }
                        style={{ alignSelf: "flex-start" }}
                      >
                        {t`Add a metric`}
                      </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <AggregationPicker
                        query={query}
                        stageIndex={stageIndex}
                        clause={editingAggregation}
                        clauseIndex={
                          picker?.kind === "metric" && picker.index != null
                            ? aggregationStart + picker.index
                            : undefined
                        }
                        operators={operators}
                        allowCustomExpressions
                        onQueryChange={(nextQuery) => {
                          storeFrom(nextQuery);
                          closePicker();
                        }}
                        onClose={closePicker}
                      />
                    </Popover.Dropdown>
                  </Popover>
                )}
                <span className={S.sectionLabel}>{t`Group by`}</span>
                {breakouts.map((breakout, index) =>
                  renderRow(
                    index,
                    Lib.displayInfo(query, stageIndex, breakout)
                      .longDisplayName,
                    () => setPicker({ kind: "breakout", index }),
                    () =>
                      storeFrom(Lib.removeClause(query, stageIndex, breakout)),
                  ),
                )}
                {!readOnly && !isMetric && (
                  <Popover
                    opened={picker?.kind === "breakout"}
                    position="bottom-start"
                    onChange={(opened) => (opened ? undefined : closePicker())}
                  >
                    <Popover.Target>
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        leftSection={<Icon name="add" size={10} />}
                        onClick={() =>
                          setPicker({ kind: "breakout", index: null })
                        }
                        style={{ alignSelf: "flex-start" }}
                      >
                        {t`Add a group`}
                      </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <QueryColumnPicker
                        query={query}
                        stageIndex={stageIndex}
                        columnGroups={breakoutGroups}
                        hasBinning
                        hasTemporalBucketing
                        withInfoIcons
                        color="core-summarize"
                        checkIsColumnSelected={(item) =>
                          editingBreakoutIndex != null &&
                          (item.breakoutPositions ?? []).includes(
                            editingBreakoutIndex,
                          )
                        }
                        onSelect={handleSelectBreakout}
                        onClose={closePicker}
                      />
                    </Popover.Dropdown>
                  </Popover>
                )}
                {!readOnly && !isMetric && (
                  <div className={S.stageActions}>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      leftSection={<Icon name="join_inner" size={10} />}
                      onClick={() => onAddStageBlock(id, "join")}
                    >
                      {t`Join the results`}
                    </Button>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      leftSection={<Icon name="add_data" size={10} />}
                      onClick={() => onAddStageBlock(id, "expression")}
                    >
                      {t`Add a column to the results`}
                    </Button>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      leftSection={<Icon name="filter" size={10} />}
                      onClick={() => onAddStageBlock(id, "filter")}
                    >
                      {t`Filter the results`}
                    </Button>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      leftSection={<Icon name="sum" size={10} />}
                      onClick={() => onAddStageBlock(id, "summarize")}
                    >
                      {t`Summarize the results`}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className={S.draftHint}>
                {t`Wire a table, a join or a filter in to pick metrics and groups, then wire the output onwards to the result.`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
