import cx from "classnames";
import type { DragEvent } from "react";
import { t } from "ttag";

import { Icon, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "../NodeBuilder.module.css";
import type { DockNodeType } from "../types";

import { Shine } from "./Shine";

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

type NodeDockProps = {
  disabledTypes?: DockNodeType[];
};

export function NodeDock({ disabledTypes = [] }: NodeDockProps) {
  const handleDragStart = (event: DragEvent, type: DockNodeType) => {
    // react-dnd's HTML5 backend listens on window and cancels native drags it did not start.
    event.stopPropagation();
    event.dataTransfer.setData(NODE_TYPE_DRAG_TYPE, type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className={S.dock} data-testid="node-builder-dock">
      <Shine />
      <div className={S.dockChips}>
        {CHIPS.map(({ type, icon, className }) => {
          const isDisabled = disabledTypes.includes(type);
          return (
            <div
              key={type}
              className={cx(S.dockChip, className, {
                [S.dockChipDisabled]: isDisabled,
              })}
              draggable={!isDisabled}
              title={isDisabled ? t`Already on the canvas` : undefined}
              onDragStart={
                isDisabled ? undefined : (event) => handleDragStart(event, type)
              }
            >
              <Icon name={icon} size={14} />
              <span>{LABELS[type]()}</span>
            </div>
          );
        })}
      </div>
      <Text fz="xs" fw={600} c="text-secondary" className={S.dockLabel}>
        {t`Drag a block onto the canvas`}
      </Text>
    </div>
  );
}
