import cx from "classnames";
import { type ReactNode, useMemo, useState } from "react";
import { msgid, ngettext } from "ttag";

import { UnstyledButton } from "metabase/ui";

import {
  type DiffBlock,
  type DiffLine,
  type SideBySideRow,
  collapseUnchanged,
  computeLineDiff,
  toSideBySideRows,
} from "../utils/sql-diff";

import S from "./SqlDiffViewer.module.css";

export type SqlDiffViewMode = "unified" | "split";

interface SqlDiffViewerProps {
  oldSql: string;
  newSql: string;
  mode: SqlDiffViewMode;
}

const MARKERS: Record<DiffLine["type"], string> = {
  context: " ",
  added: "+",
  removed: "-",
};

const lineClassName = (line: DiffLine | null) =>
  line == null
    ? S.empty
    : cx({
        [S.added]: line.type === "added",
        [S.removed]: line.type === "removed",
      });

function LineContent({ line }: { line: DiffLine }) {
  return (
    <>
      {line.segments.map((segment, index) =>
        segment.isChanged ? (
          <span key={index} className={S.changed}>
            {segment.value}
          </span>
        ) : (
          segment.value
        ),
      )}
    </>
  );
}

function UnifiedRow({ line }: { line: DiffLine }) {
  return (
    <tr
      className={lineClassName(line)}
      data-testid={`sql-diff-line-${line.type}`}
    >
      <td className={S.lineNumber}>{line.oldLineNumber}</td>
      <td className={S.lineNumber}>{line.newLineNumber}</td>
      <td className={S.marker}>{MARKERS[line.type]}</td>
      <td className={S.code}>
        <LineContent line={line} />
      </td>
    </tr>
  );
}

function SplitRow({ row }: { row: SideBySideRow }) {
  const { left, right } = row;
  return (
    <tr data-testid="sql-diff-row">
      <td className={cx(S.lineNumber, lineClassName(left))}>
        {left?.oldLineNumber}
      </td>
      <td className={cx(S.code, S.splitCode, lineClassName(left))}>
        {left && <LineContent line={left} />}
      </td>
      <td className={cx(S.lineNumber, S.splitDivider, lineClassName(right))}>
        {right?.newLineNumber}
      </td>
      <td className={cx(S.code, S.splitCode, lineClassName(right))}>
        {right && <LineContent line={right} />}
      </td>
    </tr>
  );
}

function CollapsedRow({
  lineCount,
  columnCount,
  onExpand,
}: {
  lineCount: number;
  columnCount: number;
  onExpand: () => void;
}) {
  return (
    <tr className={S.collapsedRow}>
      <td colSpan={columnCount}>
        <UnstyledButton className={S.expandButton} onClick={onExpand}>
          {ngettext(
            msgid`Show ${lineCount} unchanged line`,
            `Show ${lineCount} unchanged lines`,
            lineCount,
          )}
        </UnstyledButton>
      </td>
    </tr>
  );
}

function DiffTable<T>({
  blocks,
  columnCount,
  renderItem,
}: {
  blocks: DiffBlock<T>[];
  columnCount: number;
  renderItem: (item: T, key: string) => ReactNode;
}) {
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(
    () => new Set(),
  );

  return (
    <table className={S.table}>
      <tbody>
        {blocks.map((block, blockIndex) =>
          block.type === "collapsed" && !expandedBlocks.has(blockIndex) ? (
            <CollapsedRow
              key={`collapsed-${blockIndex}`}
              lineCount={block.items.length}
              columnCount={columnCount}
              onExpand={() =>
                setExpandedBlocks((blocks) => new Set(blocks).add(blockIndex))
              }
            />
          ) : (
            block.items.map((item, itemIndex) =>
              renderItem(item, `${blockIndex}-${itemIndex}`),
            )
          ),
        )}
      </tbody>
    </table>
  );
}

/**
 * Read-only, GitHub-style diff of two SQL texts, in unified or side-by-side
 * layout. Long unchanged stretches are collapsed and can be expanded; give the
 * component a new `key` to collapse them again.
 */
export function SqlDiffViewer({ oldSql, newSql, mode }: SqlDiffViewerProps) {
  const lines = useMemo(
    () => computeLineDiff(oldSql, newSql),
    [oldSql, newSql],
  );

  return (
    <div className={S.container} data-testid="sql-diff-viewer">
      {mode === "unified" ? (
        <DiffTable
          blocks={collapseUnchanged(lines, (line) => line.type === "context")}
          columnCount={4}
          renderItem={(line, key) => <UnifiedRow key={key} line={line} />}
        />
      ) : (
        <DiffTable
          blocks={collapseUnchanged(
            toSideBySideRows(lines),
            (row) => row.left?.type === "context",
          )}
          columnCount={4}
          renderItem={(row, key) => <SplitRow key={key} row={row} />}
        />
      )}
    </div>
  );
}
