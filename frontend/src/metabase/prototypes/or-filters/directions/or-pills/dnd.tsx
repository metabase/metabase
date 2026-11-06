import {
  type CollisionDetection,
  type UniqueIdentifier,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { useMergedRef } from "@mantine/hooks";
import {
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
  forwardRef,
  useEffect,
  useRef,
} from "react";
import { t } from "ttag";

import { Text } from "metabase/ui";

import { Token } from "./Token";
import S from "./Token.module.css";
import {
  type PillPath,
  type PillTree,
  appendOrRows,
  appendToRow,
  getClause,
  removeClause,
  toSingleClauseTree,
} from "./orPills";

/**
 * Everything that drags or takes a drop, encoded in its dnd-kit id:
 * top-level pills, the open editor's tokens and rows, the editor as a whole
 * (drop = new OR row) and the filter bar (drop = new top-level pill).
 */
export type DndItem =
  | { kind: "pill"; filterIndex: number }
  | { kind: "token"; path: PillPath }
  | { kind: "row"; rowIndex: number }
  | { kind: "editor" }
  | { kind: "bar" };

export type DragSource = Extract<DndItem, { kind: "pill" | "token" }>;

export const EDITOR_DROP_ID = "editor";
export const BAR_DROP_ID = "bar";
export const PILL_ATTRIBUTE = "data-or-pill";

export const getPillId = (filterIndex: number) => `pill:${filterIndex}`;
export const getTokenId = (path: PillPath) => `token:${path.join(".")}`;
export const getRowId = (rowIndex: number) => `row:${rowIndex}`;

export function parseDndId(id: UniqueIdentifier): DndItem | undefined {
  const [kind, value = ""] = String(id).split(":");
  switch (kind) {
    case "pill":
      return { kind, filterIndex: Number(value) };
    case "token":
      return { kind, path: value.split(".").map(Number) };
    case "row":
      return { kind, rowIndex: Number(value) };
    case "editor":
    case "bar":
      return { kind };
  }
  return undefined;
}

const DROP_PRIORITY: Record<DndItem["kind"], number> = {
  row: 0,
  token: 1,
  pill: 1,
  editor: 2,
  bar: 3,
};

const getKind = (id: UniqueIdentifier) => parseDndId(id)?.kind;

/**
 * Rows sort among themselves. Pills and tokens drop on whatever is under the
 * pointer, the most specific target first (a row beats the editor around it).
 */
export const collisionDetection: CollisionDetection = (args) => {
  if (getKind(args.active.id) === "row") {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => getKind(container.id) === "row",
      ),
    });
  }
  const hits = pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) =>
        container.id !== args.active.id && getKind(container.id) !== undefined,
    ),
  });
  const priority = (id: UniqueIdentifier) =>
    DROP_PRIORITY[getKind(id) ?? "bar"];
  if (hits.length > 0) {
    return hits.sort((a, b) => priority(a.id) - priority(b.id));
  }
  return isNearBar(args) ? [{ id: BAR_DROP_ID }] : [];
};

/** The bar is one pill tall; this much slack around it still counts as a hit. */
const BAR_SLACK_PX = 40;

function isNearBar({
  droppableRects,
  pointerCoordinates,
}: Parameters<CollisionDetection>[0]) {
  const rect = droppableRects.get(BAR_DROP_ID);
  if (!rect || !pointerCoordinates) {
    return false;
  }
  const { x, y } = pointerCoordinates;
  return (
    x >= rect.left - BAR_SLACK_PX &&
    x <= rect.right + BAR_SLACK_PX &&
    y >= rect.top - BAR_SLACK_PX &&
    y <= rect.bottom + BAR_SLACK_PX
  );
}

export type DropResult = {
  /** One tree per top-level filter; an empty tree removes its filter. */
  trees: PillTree[];
  /** A new top-level pill, when a token was dropped on the bar. */
  added?: PillTree;
  /** Whether only the open pill's draft changed. */
  isDraftOnly: boolean;
};

const EMPTY_TREE: PillTree = { type: "group", children: [] };

export function applyDrop(
  trees: PillTree[],
  openIndex: number | undefined,
  source: DragSource,
  target: DndItem,
): DropResult | undefined {
  const payload = getPayload(trees, openIndex, source);
  const isOwnEditor =
    source.kind === "pill" &&
    source.filterIndex === openIndex &&
    (target.kind === "row" || target.kind === "editor");
  const isSelf =
    source.kind === "pill" &&
    target.kind === "pill" &&
    source.filterIndex === target.filterIndex;
  if (!payload || isOwnEditor || isSelf) {
    return undefined;
  }

  const next = [...trees];
  let added: PillTree | undefined;
  if (target.kind === "pill") {
    next[target.filterIndex] = appendOrRows(next[target.filterIndex], payload);
  } else if (target.kind === "bar") {
    if (source.kind === "pill") {
      return undefined;
    }
    added = payload;
  } else if (openIndex !== undefined && target.kind === "editor") {
    next[openIndex] = appendOrRows(next[openIndex], payload);
  } else if (openIndex !== undefined && target.kind === "row") {
    next[openIndex] = appendToRow(next[openIndex], target.rowIndex, payload);
  } else {
    return undefined;
  }

  // Drops only ever append, so the source's own path is still valid here.
  if (source.kind === "pill") {
    next[source.filterIndex] = EMPTY_TREE;
  } else if (openIndex !== undefined) {
    next[openIndex] = removeClause(next[openIndex], source.path);
  }

  const isDraftOnly =
    source.kind === "token" &&
    (target.kind === "row" ||
      target.kind === "editor" ||
      (target.kind === "pill" && target.filterIndex === openIndex));
  return { trees: next, added, isDraftOnly };
}

function getPayload(
  trees: PillTree[],
  openIndex: number | undefined,
  source: DragSource,
): PillTree | undefined {
  if (source.kind === "pill") {
    return trees[source.filterIndex];
  }
  const clause =
    openIndex !== undefined
      ? getClause(trees[openIndex], source.path)
      : undefined;
  return clause ? toSingleClauseTree(clause) : undefined;
}

type DraggableTokenProps = Omit<ComponentPropsWithoutRef<"span">, "onClick"> & {
  /** Not `id`: Popover.Target overwrites that prop with its own. */
  dndId: string;
  isDroppable?: boolean;
  children: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onRemove: () => void;
};

/**
 * A token that can be dragged. A droppable one (a top-level pill) shows the
 * Figma "drop to OR" state while another token hovers it.
 */
export const DraggableToken = forwardRef<HTMLSpanElement, DraggableTokenProps>(
  function DraggableToken(
    { dndId, isDroppable = false, children, onClick, onRemove, ...props },
    ref,
  ) {
    const drag = useDraggable({ id: dndId });
    const drop = useDroppable({ id: dndId, disabled: !isDroppable });
    const mergedRef = useMergedRef(ref, drag.setNodeRef, drop.setNodeRef);

    return (
      <span
        {...props}
        ref={mergedRef}
        className={S.draggable}
        data-dragging={drag.isDragging}
        data-over={drop.isOver}
        {...(isDroppable ? { [PILL_ATTRIBUTE]: true } : {})}
        {...drag.attributes}
        {...drag.listeners}
      >
        <Token onClick={onClick} onRemove={onRemove}>
          {children}
          {drop.isOver && (
            <Text span inherit fw="normal" c="text-secondary">
              {t`or …`}
            </Text>
          )}
        </Token>
      </span>
    );
  },
);

/**
 * Whether the latest pointer press landed on a top-level pill. Pressing a
 * pill may start a drag into the open editor, so it must not count as a click
 * outside that editor's popover.
 */
export function usePointerOnPill() {
  const isOnPillRef = useRef(false);
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      isOnPillRef.current =
        event.target instanceof Element &&
        event.target.closest(`[${PILL_ATTRIBUTE}]`) !== null;
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, []);
  return () => isOnPillRef.current;
}
