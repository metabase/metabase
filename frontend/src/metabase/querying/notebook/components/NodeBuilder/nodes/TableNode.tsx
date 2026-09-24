import {
  type NodeProps,
  Position,
  useUpdateNodeInternals,
} from "@xyflow/react";
import cx from "classnames";
import { type CSSProperties, memo, useEffect, useMemo } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { SourceList } from "../components/SourceList";
import { useNodeBuilderContext } from "../context";
import { STAGE_INDEX, TABLE_COLOR } from "../graph";
import type { TableFlowNode } from "../types";

import { NodeHandle } from "./NodeHandle";
import { NodeHeader } from "./NodeHeader";
import S from "./nodes.module.css";

type TableNodeProps = NodeProps<TableFlowNode>;

// A table block. Blank until a table is picked; once it is part of the
// compiled query it shows which columns are join keys and lets columns be
// toggled in and out of the result.
export const TableNode = memo(function TableNode({ id, data }: TableNodeProps) {
  const {
    compiled,
    readOnly,
    sources,
    databases,
    isLoadingSources,
    sourceDatabaseId,
    onPickTable,
    onToggleColumn,
    onRemoveNode,
    onToggleCollapsed,
  } = useNodeBuilderContext();
  const isCollapsed = data.collapsed ?? true;
  const { table, tableName, columns, excludedColumns } = data;

  const isSource = compiled.sourceNodeId === id;
  const isActive = compiled.activeNodeIds.has(id);

  // The handle only exists once a table is picked; tell React Flow to measure it then.
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    if (table != null) {
      updateNodeInternals(id);
    }
  }, [table, id, updateNodeInternals]);
  const joinRef = compiled.tableJoinIndexByNodeId.get(id);
  // The source reads the result's query; a joined table reads its join's chain.
  const query = joinRef?.query ?? compiled.query;
  const joinIndex = joinRef?.joinIndex;
  const joinStageIndex = joinRef?.stageIndex ?? STAGE_INDEX;

  // Columns that take part in a join condition, so we can light them up.
  const keyNames = useMemo(() => {
    const names = new Set<string>();
    if (!query || !isActive) {
      return names;
    }
    Lib.joins(query, joinStageIndex).forEach((join, index) => {
      Lib.joinConditions(join).forEach((condition) => {
        let parts: Lib.JoinConditionParts;
        try {
          parts = Lib.joinConditionParts(condition);
        } catch {
          return;
        }
        const { lhsExpression, rhsExpression } = parts;
        if (index === joinIndex) {
          Lib.joinConditionRHSColumns(
            query,
            joinStageIndex,
            join,
            lhsExpression,
            rhsExpression,
          ).forEach((column) => {
            const info = Lib.displayInfo(query, joinStageIndex, column);
            if (info.selected) {
              names.add(info.name);
            }
          });
        }
        if (isSource) {
          Lib.joinConditionLHSColumns(
            query,
            STAGE_INDEX,
            join,
            lhsExpression,
            rhsExpression,
          ).forEach((column) => {
            const info = Lib.displayInfo(query, STAGE_INDEX, column);
            if (info.selected && !info.isFromJoin) {
              names.add(info.name);
            }
          });
        }
      });
    });
    return names;
  }, [query, isActive, isSource, joinIndex, joinStageIndex]);

  const filterNames = useMemo(
    () =>
      query && isSource
        ? Lib.filters(query, STAGE_INDEX).map(
            (filter) => Lib.displayInfo(query, STAGE_INDEX, filter).displayName,
          )
        : [],
    [query, isSource],
  );

  const excluded = useMemo(() => new Set(excludedColumns), [excludedColumns]);
  const selectedCount = columns.length - excluded.size;

  const subtitle = !table
    ? t`Pick a table`
    : !isActive
      ? t`Not wired into the result`
      : isSource
        ? t`Source · ${selectedCount}/${columns.length} columns`
        : t`Joined · ${selectedCount}/${columns.length} columns`;

  // CSS custom properties are not part of React's CSSProperties type.
  const nodeStyle = {
    "--node-color": TABLE_COLOR,
  } as CSSProperties;

  return (
    <div
      className={cx(
        S.node,
        { [S.collapsed]: isCollapsed && table != null },
        { [S.draft]: table == null },
      )}
      style={nodeStyle}
      data-testid="node-builder-table-node"
    >
      {table != null && (
        <NodeHandle
          type="source"
          position={Position.Right}
          id="out"
          isConnectable={!readOnly}
        />
      )}
      <NodeHeader
        icon="table2"
        title={table ? tableName : t`Table`}
        subtitle={subtitle}
        isDraft={table == null}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => onToggleCollapsed(id)}
        onRemove={readOnly ? undefined : () => onRemoveNode(id)}
      />
      {(!isCollapsed || !table) && (
        <>
          {filterNames.length > 0 && (
            <div className={S.filters}>
              {filterNames.map((name, index) => (
                <span key={index} className={S.filterPill}>
                  <Icon name="filter" size={10} />
                  {name}
                </span>
              ))}
            </div>
          )}
          {table ? (
            <div className={cx(S.columns, "nowheel")}>
              {columns.map((column) => {
                const isKey = keyNames.has(column.name);
                const isSelected = !excluded.has(column.name);
                return (
                  <div
                    key={column.name}
                    className={cx(S.column, {
                      [S.unselected]: !isSelected,
                      [S.key]: isKey,
                      [S.readOnly]: readOnly,
                    })}
                    title={column.longDisplayName}
                    onClick={
                      readOnly
                        ? undefined
                        : () => onToggleColumn(id, column.name)
                    }
                  >
                    <Icon
                      name={column.icon}
                      size={12}
                      className={S.columnIcon}
                    />
                    <span className={S.columnName}>{column.displayName}</span>
                    {isKey && <span className={S.keyBadge}>{t`key`}</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={cx(S.draftPicker, "nodrag", "nowheel")}>
              <SourceList
                databases={databases}
                sources={sources}
                isLoading={isLoadingSources}
                sourceDatabaseId={sourceDatabaseId}
                onPick={(source) =>
                  onPickTable(id, source.id, source.databaseId)
                }
              />
            </div>
          )}
        </>
      )}
    </div>
  );
});
