import { type NodeProps, Position, useNodeConnections } from "@xyflow/react";
import cx from "classnames";
import { type CSSProperties, memo, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { SelectList } from "metabase/common/components/SelectList";
import { Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getJoinStrategyIcon } from "../../JoinStep/utils";
import { useNodeBuilderContext } from "../context";
import { JOIN_COLOR, STAGE_INDEX } from "../graph";
import type { JoinFlowNode } from "../types";

import { JoinConditionRow } from "./JoinConditionRow";
import { NodeHandle } from "./NodeHandle";
import { NodeHeader } from "./NodeHeader";
import S from "./nodes.module.css";

type JoinNodeProps = NodeProps<JoinFlowNode>;

// A join block. Until both inputs are wired it just waits; once it is part of
// the compiled query it edits that join's strategy and conditions, and the
// edits are kept on the block so recompiling never loses them.
export const JoinNode = memo(function JoinNode({ id, data }: JoinNodeProps) {
  const {
    compiled,
    readOnly,
    onStrategyChange,
    onConditionsChange,
    onRemoveNode,
    onToggleCollapsed,
  } = useNodeBuilderContext();
  const isCollapsed = data.collapsed ?? false;
  const [isAddingCondition, setIsAddingCondition] = useState(false);
  const [isStrategyOpened, setIsStrategyOpened] = useState(false);

  const lhsConnections = useNodeConnections({
    id,
    handleType: "target",
    handleId: "lhs",
  });
  const rhsConnections = useNodeConnections({
    id,
    handleType: "target",
    handleId: "rhs",
  });
  const hasLhs = lhsConnections.length > 0;
  const hasRhs = rhsConnections.length > 0;

  const joinRef = compiled.joinIndexByNodeId.get(id);
  // The chain's query right after this join, whether or not it reaches the result.
  const query = joinRef?.query ?? null;
  const stageIndex = joinRef?.stageIndex ?? STAGE_INDEX;
  const join = useMemo(
    () =>
      query != null && joinRef != null
        ? Lib.joins(query, joinRef.stageIndex)[joinRef.joinIndex]
        : undefined,
    [query, joinRef],
  );
  const isActive = join != null;

  const strategy = join ? Lib.joinStrategy(join) : data.strategy;
  const strategyInfo = useMemo(
    () =>
      query && strategy ? Lib.displayInfo(query, stageIndex, strategy) : null,
    [query, strategy, stageIndex],
  );
  const strategies = useMemo(
    () =>
      query
        ? Lib.availableJoinStrategies(query, stageIndex).map((item) => ({
            strategy: item,
            info: Lib.displayInfo(query, stageIndex, item),
          }))
        : [],
    [query, stageIndex],
  );
  const conditions = useMemo(
    () => (join ? Lib.joinConditions(join) : []),
    [join],
  );
  const lhsTableName = useMemo(
    () =>
      query && join ? Lib.joinLHSDisplayName(query, stageIndex, join) : "",
    [query, join, stageIndex],
  );
  const rhsTableName = useMemo(
    () =>
      query && join
        ? Lib.displayInfo(query, stageIndex, Lib.joinedThing(query, join))
            .displayName
        : "",
    [query, join, stageIndex],
  );

  // CSS custom properties are not part of React's CSSProperties type.
  const nodeStyle = { "--node-color": JOIN_COLOR } as CSSProperties;

  const handleConditionChange = (
    newCondition: Lib.JoinCondition,
    index: number,
  ) => {
    const next = [...conditions];
    next[index] = newCondition;
    onConditionsChange(id, next);
  };

  const handleConditionRemove = (index: number) => {
    const next = [...conditions];
    next.splice(index, 1);
    onConditionsChange(id, next);
  };

  const handleConditionAdd = (newCondition: Lib.JoinCondition) => {
    onConditionsChange(id, [...conditions, newCondition]);
    setIsAddingCondition(false);
  };

  const handleStrategyPick = (newStrategy: Lib.JoinStrategy) => {
    onStrategyChange(id, newStrategy);
    setIsStrategyOpened(false);
  };

  const titleIcon = strategyInfo
    ? getJoinStrategyIcon(strategyInfo)
    : "join_inner";
  const titleText = strategyInfo ? strategyInfo.displayName : t`Join`;
  const canPickStrategy = strategyInfo != null && !readOnly;

  const subtitle = isActive
    ? ngettext(
        msgid`${conditions.length} condition`,
        `${conditions.length} conditions`,
        conditions.length,
      )
    : hasLhs && hasRhs
      ? (compiled.error ?? t`Wire the chain into the result`)
      : t`Wire both inputs`;

  // The join type is a dropdown in the header once the join compiles.
  const titleRow = canPickStrategy ? (
    <Popover
      opened={isStrategyOpened}
      position="bottom-start"
      onChange={setIsStrategyOpened}
    >
      <Popover.Target>
        <button
          type="button"
          className={cx(S.headerTitleRow, S.headerPicker, "nodrag", {
            [S.opened]: isStrategyOpened,
          })}
          aria-label={t`Change join type`}
          onClick={() => setIsStrategyOpened((opened) => !opened)}
        >
          <Icon name={titleIcon} size={18} />
          <span className={S.title}>{titleText}</span>
          <Icon
            name="chevrondown"
            size={10}
            className={S.headerPickerChevron}
          />
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <SelectList className={S.strategyList}>
          {strategies.map((item, index) => (
            <SelectList.Item
              id={index}
              key={index}
              name={item.info.displayName}
              icon={{ name: getJoinStrategyIcon(item.info), size: 24 }}
              isSelected={item.info.shortName === strategyInfo.shortName}
              onSelect={() => handleStrategyPick(item.strategy)}
            />
          ))}
        </SelectList>
      </Popover.Dropdown>
    </Popover>
  ) : (
    <div className={S.headerTitleRow}>
      <Icon name={titleIcon} size={18} />
      <span className={S.title}>{titleText}</span>
    </div>
  );

  return (
    <div
      className={cx(S.node, { [S.collapsed]: isCollapsed }, S.joinNode, {
        [S.draft]: !isActive,
      })}
      style={nodeStyle}
      data-testid="node-builder-join-node"
    >
      <NodeHandle
        type="target"
        position={Position.Left}
        id="lhs"
        style={{ top: isCollapsed ? "24%" : "40%" }}
        isConnectable={!readOnly}
      />
      <span
        className={S.handleLabel}
        style={{ top: isCollapsed ? "24%" : "40%" }}
      >
        {t`left`}
      </span>
      <NodeHandle
        type="target"
        position={Position.Left}
        id="rhs"
        style={{ top: isCollapsed ? "76%" : "62%" }}
        isConnectable={!readOnly}
      />
      <span
        className={S.handleLabel}
        style={{ top: isCollapsed ? "76%" : "62%" }}
      >
        {t`right`}
      </span>
      <NodeHandle
        type="source"
        position={Position.Right}
        id="out"
        isConnectable={!readOnly}
      />
      <NodeHeader
        title={titleRow}
        subtitle={subtitle}
        isDraft={!isActive}
        isCollapsed={isCollapsed}
        stageIndex={stageIndex}
        onToggleCollapsed={() => onToggleCollapsed(id)}
        onRemove={readOnly ? undefined : () => onRemoveNode(id)}
        removeLabel={t`Change join type`}
      />
      {!isCollapsed && (
        <div className={cx(S.joinBody, "nodrag", "nowheel")}>
          {isActive && query && join ? (
            <>
              {conditions.map((condition, index) => (
                <JoinConditionRow
                  key={index}
                  query={query}
                  stageIndex={stageIndex}
                  join={join}
                  condition={condition}
                  lhsTableName={lhsTableName}
                  rhsTableName={rhsTableName}
                  isReadOnly={readOnly}
                  isRemovable={conditions.length > 1}
                  onChange={(newCondition) =>
                    handleConditionChange(newCondition, index)
                  }
                  onRemove={() => handleConditionRemove(index)}
                />
              ))}
              {isAddingCondition ? (
                <JoinConditionRow
                  key="draft"
                  query={query}
                  stageIndex={stageIndex}
                  join={join}
                  lhsTableName={lhsTableName}
                  rhsTableName={rhsTableName}
                  isReadOnly={readOnly}
                  isRemovable
                  onChange={handleConditionAdd}
                  onRemove={() => setIsAddingCondition(false)}
                />
              ) : (
                !readOnly && (
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<Icon name="add" size={10} />}
                    onClick={() => setIsAddingCondition(true)}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {t`Add condition`}
                  </Button>
                )
              )}
            </>
          ) : (
            <div className={S.draftHint}>
              {t`Drag a table or the previous join into the left input, a table into the right input, then wire the output onwards to the result.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
