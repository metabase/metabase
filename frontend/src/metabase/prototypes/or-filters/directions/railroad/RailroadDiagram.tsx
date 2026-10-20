import { useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";

import S from "./RailroadDiagram.module.css";
import {
  type BranchButtonShape,
  type CountShape,
  PILL_HEIGHT,
  type PillShape,
  type PlusShape,
  layoutRailroad,
} from "./layout";
import {
  type AndNode,
  type NodePath,
  type RailNode,
  stageTree,
  writeRailTree,
} from "./railroad";

const PILL_RADIUS = PILL_HEIGHT / 2;
const PILL_PADDING_X = 12;
const ICON_RADIUS = 8;
const PLUS_RADIUS = 9;
const BRANCH_BUTTON = { width: 56, height: 22 };

/** The element that was clicked, so a popover can anchor to it. */
export type RailAnchor = SVGElement;

export type RailroadDiagramHandlers = {
  onRemove: (path: NodePath) => void;
  onEdit: (path: NodePath, anchor: RailAnchor) => void;
  onInsert: (andPath: NodePath, index: number, anchor: RailAnchor) => void;
  onAlternative: (path: NodePath, anchor: RailAnchor) => void;
  onBranch: (orPath: NodePath, anchor: RailAnchor) => void;
};

type RailroadDiagramProps = RailroadDiagramHandlers & {
  query: Lib.Query;
  stageIndex: number;
  root: AndNode;
  /** Draws the number of rows reaching each pill and each merge point. */
  showCounts?: boolean;
};

export function RailroadDiagram({
  query,
  stageIndex,
  root,
  showCounts = false,
  onRemove,
  onEdit,
  onInsert,
  onAlternative,
  onBranch,
}: RailroadDiagramProps) {
  const measureText = useLabelMeasurer();
  const labelOf = (node: RailNode) =>
    node.type === "cond" ? getFilterLabel(query, stageIndex, node.clause) : "";
  const layout = layoutRailroad(root, {
    labelOf,
    measureLabel: (node) => measureText(labelOf(node)),
    showCounts,
  });

  return (
    <svg
      className={S.svg}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
    >
      {layout.shapes.map((shape, index) => {
        switch (shape.kind) {
          case "track":
            return <path key={index} className={S.track} d={shape.d} />;
          case "pill":
            return (
              <Pill
                key={index}
                shape={shape}
                onRemove={onRemove}
                onEdit={onEdit}
                onAlternative={onAlternative}
              />
            );
          case "plus":
            return <Plus key={index} shape={shape} onInsert={onInsert} />;
          case "or-label":
            return (
              <text
                key={index}
                className={S.orLabel}
                x={shape.x}
                y={shape.y}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {t`or`}
              </text>
            );
          case "branch-button":
            return (
              <BranchButton key={index} shape={shape} onBranch={onBranch} />
            );
          case "count":
            return (
              <StageCount
                key={index}
                shape={shape}
                query={query}
                stageIndex={stageIndex}
                root={root}
              />
            );
        }
      })}
    </svg>
  );
}

type PillProps = Pick<
  RailroadDiagramHandlers,
  "onRemove" | "onEdit" | "onAlternative"
> & { shape: PillShape };

function Pill({ shape, onRemove, onEdit, onAlternative }: PillProps) {
  const { x, y, width, label, path } = shape;
  const forkX = width - ICON_RADIUS * 4;
  const closeX = width - ICON_RADIUS * 2;

  return (
    <g className={S.pill} transform={`translate(${x},${y})`}>
      <rect
        className={S.pillBody}
        width={width}
        height={PILL_HEIGHT}
        rx={PILL_RADIUS}
      />
      <text
        className={S.pillLabel}
        x={PILL_PADDING_X}
        y={PILL_RADIUS}
        dominantBaseline="central"
        onClick={(event) => onEdit(path, event.currentTarget)}
      >
        {label}
      </text>
      <g
        className={S.pillAction}
        transform={`translate(${forkX},${PILL_RADIUS})`}
        role="button"
        aria-label={t`Add an alternative`}
        onClick={(event) => onAlternative(path, event.currentTarget)}
      >
        <circle r={ICON_RADIUS} fill="transparent" />
        <path d="M -5 0 H -1 M -1 0 Q 1 0 1 -2 Q 1 -4 3 -4 H 5 M -1 0 Q 1 0 1 2 Q 1 4 3 4 H 5" />
      </g>
      <g
        className={S.pillAction}
        transform={`translate(${closeX},${PILL_RADIUS})`}
        role="button"
        aria-label={t`Remove`}
        onClick={() => onRemove(path)}
      >
        <circle r={ICON_RADIUS} fill="transparent" />
        <line x1={-3.5} y1={-3.5} x2={3.5} y2={3.5} />
        <line x1={-3.5} y1={3.5} x2={3.5} y2={-3.5} />
      </g>
    </g>
  );
}

type PlusProps = Pick<RailroadDiagramHandlers, "onInsert"> & {
  shape: PlusShape;
};

function Plus({ shape, onInsert }: PlusProps) {
  const className = shape.isTrailing ? S.plus : `${S.plus} ${S.plusBetween}`;
  return (
    <g
      className={className}
      transform={`translate(${shape.x},${shape.y})`}
      role="button"
      aria-label={t`Add a filter in series`}
      onClick={(event) =>
        onInsert(shape.andPath, shape.index, event.currentTarget)
      }
    >
      <circle r={PLUS_RADIUS} />
      <text textAnchor="middle" dominantBaseline="central">
        +
      </text>
    </g>
  );
}

type BranchButtonProps = Pick<RailroadDiagramHandlers, "onBranch"> & {
  shape: BranchButtonShape;
};

function BranchButton({ shape, onBranch }: BranchButtonProps) {
  return (
    <g
      className={S.branchButton}
      transform={`translate(${shape.x},${shape.y})`}
      role="button"
      aria-label={t`Add a branch`}
      onClick={(event) => onBranch(shape.orPath, event.currentTarget)}
    >
      <rect
        width={BRANCH_BUTTON.width}
        height={BRANCH_BUTTON.height}
        rx={BRANCH_BUTTON.height / 2}
      />
      <text
        x={BRANCH_BUTTON.width / 2}
        y={BRANCH_BUTTON.height / 2}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {t`+ or`}
      </text>
    </g>
  );
}

type StageCountProps = {
  shape: CountShape;
  query: Lib.Query;
  stageIndex: number;
  root: AndNode;
};

/** Rows that reach this point on the track: one count query per stage. */
function StageCount({ shape, query, stageIndex, root }: StageCountProps) {
  const { stage, x, y, anchor } = shape;
  const countJsQuery = useMemo(() => {
    const stageQuery = writeRailTree(query, stageIndex, stageTree(root, stage));
    return Lib.toJsQuery(Lib.aggregateByCount(stageQuery, stageIndex));
  }, [query, stageIndex, root, stage]);
  const count = useGetAdhocQueryQuery({ ...countJsQuery, ignore_error: true });
  const rowCount = count.data?.data?.rows?.[0]?.[0];
  const label = count.isFetching || rowCount == null ? "…" : String(rowCount);

  return (
    <text
      className={S.count}
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
    >
      {label}
    </text>
  );
}

const FALLBACK_CHAR_WIDTH = 8;

/** Label widths from a canvas, in the diagram's font, so pills fit their text. */
function useLabelMeasurer() {
  return useMemo(() => {
    const context = document.createElement("canvas").getContext("2d");
    const family = getComputedStyle(document.body)
      .getPropertyValue("--mantine-font-family-monospace")
      .trim();
    if (context) {
      context.font = `600 13px ${family || "monospace"}`;
    }
    return (label: string) =>
      context
        ? context.measureText(label).width
        : label.length * FALLBACK_CHAR_WIDTH;
  }, []);
}
