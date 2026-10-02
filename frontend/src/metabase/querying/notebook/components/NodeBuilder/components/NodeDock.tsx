import cx from "classnames";
import type { DragEvent } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "../NodeBuilder.module.css";
import { useNodeBuilderContext } from "../context";
import type { DockNodeType } from "../types";

export const NODE_TYPE_DRAG_TYPE = "application/x-metabase-node-type";

const CHIPS: { type: DockNodeType; icon: IconName; className: string }[] = [
  { type: "table", icon: "table2", className: S.dockTable },
  { type: "join", icon: "join_inner", className: S.dockJoin },
  { type: "expression", icon: "add_data", className: S.dockExpression },
  { type: "filter", icon: "filter", className: S.dockFilter },
  { type: "summarize", icon: "sum", className: S.dockSummarize },
  { type: "sort", icon: "sort", className: S.dockSort },
  { type: "limit", icon: "list", className: S.dockLimit },
];

const LABELS: Record<DockNodeType, () => string> = {
  table: () => t`Table`,
  join: () => t`Join`,
  expression: () => t`Custom column`,
  filter: () => t`Filter`,
  summarize: () => t`Summarize`,
  sort: () => t`Sort`,
  limit: () => t`Limit`,
};

// One chip per block kind; dragging one onto the canvas drops a blank block
// where it lands, clicking one drops it in the middle of the view.
export function NodeDock() {
  const { onAddBlock } = useNodeBuilderContext();
  const handleDragStart = (event: DragEvent, type: DockNodeType) => {
    // react-dnd's HTML5 backend listens on window and cancels native drags it did not start.
    event.stopPropagation();
    event.dataTransfer.setData(NODE_TYPE_DRAG_TYPE, type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className={S.dock} data-testid="node-builder-dock">
      <div className={S.dockChips}>
        {CHIPS.map(({ type, icon, className }) => (
          <button
            key={type}
            type="button"
            className={cx(S.dockChip, className)}
            draggable
            onDragStart={(event) => handleDragStart(event, type)}
            onClick={() => onAddBlock(type)}
          >
            <Icon name={icon} size={14} />
            <span>{LABELS[type]()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
