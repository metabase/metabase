import { type NodeProps, Position } from "@xyflow/react";
import cx from "classnames";
import { type CSSProperties, memo, useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useNodeBuilderContext } from "../context";
import { RESULT_COLOR, getCanvasColumnIcon } from "../graph";
import type { ResultFlowNode } from "../types";

import { NodeHandle } from "./NodeHandle";
import { NodeHeader } from "./NodeHeader";
import S from "./nodes.module.css";

type ResultNodeProps = NodeProps<ResultFlowNode>;

// Joined columns carry their table in the long name, e.g. "Products → ID"; show that part muted.
function getSourcePrefix(info: Lib.ColumnDisplayInfo): string {
  const { displayName, longDisplayName } = info;
  const hasPrefix =
    longDisplayName !== displayName && longDisplayName.endsWith(displayName);
  return hasPrefix
    ? longDisplayName.slice(0, longDisplayName.length - displayName.length)
    : "";
}

// The one block that is always there. Whatever is wired into it is the query.
export const ResultNode = memo(function ResultNode({
  id,
  data,
}: ResultNodeProps) {
  const { compiled, readOnly, isRunnable, onVisualize, onToggleCollapsed } =
    useNodeBuilderContext();
  const isCollapsed = data.collapsed ?? false;
  const query = compiled.query;

  const columns = useMemo(
    () =>
      query
        ? Lib.returnedColumns(query, Lib.stageCount(query) - 1).map(
            (column) => ({
              column,
              info: Lib.displayInfo(query, Lib.stageCount(query) - 1, column),
            }),
          )
        : [],
    [query],
  );
  const [isColumnsOpen, setIsColumnsOpen] = useState(true);

  // CSS custom properties are not part of React's CSSProperties type.
  const nodeStyle = { "--node-color": RESULT_COLOR } as CSSProperties;

  return (
    <div
      className={cx(
        S.node,
        { [S.collapsed]: isCollapsed },
        { [S.draft]: !query },
      )}
      style={nodeStyle}
      data-testid="node-builder-result-node"
    >
      <NodeHandle
        type="target"
        position={Position.Left}
        id="in"
        isConnectable={!readOnly}
      />
      <NodeHeader
        icon="table"
        title={t`Result`}
        subtitle={
          query ? t`${columns.length} columns` : t`Nothing wired in yet`
        }
        isDraft={!query}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => onToggleCollapsed(id)}
      />
      {!isCollapsed && (
        <>
          <div className={cx(S.resultBody, "nodrag")}>
            {query ? (
              <>
                <button
                  type="button"
                  className={S.collapseToggle}
                  aria-expanded={isColumnsOpen}
                  onClick={() => setIsColumnsOpen((isOpen) => !isOpen)}
                >
                  <Icon
                    name={isColumnsOpen ? "chevrondown" : "chevronright"}
                    size={10}
                  />
                  {t`Columns`}
                </button>
                {isColumnsOpen && (
                  <ol className={cx(S.columns, S.resultColumns, "nowheel")}>
                    {columns.map(({ column, info }, index) => (
                      <li
                        key={index}
                        className={cx(S.column, S.readOnly)}
                        title={info.longDisplayName}
                      >
                        <Icon
                          name={getCanvasColumnIcon(column)}
                          size={12}
                          className={S.columnIcon}
                        />
                        <span className={S.columnName}>
                          {getSourcePrefix(info) && (
                            <span className={S.columnSource}>
                              {getSourcePrefix(info)}
                            </span>
                          )}
                          {info.displayName}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <Button
                  variant="filled"
                  fullWidth
                  leftSection={<Icon name="play" />}
                  disabled={!isRunnable}
                  onClick={onVisualize}
                >
                  {t`Visualize`}
                </Button>
              </>
            ) : (
              <div className={S.draftHint}>
                {compiled.error ??
                  t`Wire a table, or the last join of a chain, into this block to build the query.`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
