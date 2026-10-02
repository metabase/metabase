import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { DRAG_HANDLE_CLASS } from "../graph";

import { CollapseButton } from "./CollapseButton";
import S from "./nodes.module.css";

type NodeHeaderProps = {
  // Left out when the title carries its own icon, as the join type picker does.
  icon?: IconName;
  // A string, or a ready-made title row.
  title: ReactNode;
  subtitle: ReactNode;
  isDraft: boolean;
  isCollapsed: boolean;
  // Blocks from the second stage on say so.
  stageIndex?: number;
  onToggleCollapsed: () => void;
  // Absent for the result block, which cannot be removed.
  onRemove?: () => void;
  removeLabel?: string;
};

// The bar every block shares: it is also the block's drag handle.
export function NodeHeader({
  icon,
  title,
  subtitle,
  isDraft,
  isCollapsed,
  stageIndex = 0,
  onToggleCollapsed,
  onRemove,
  removeLabel = t`Remove`,
}: NodeHeaderProps) {
  return (
    <div
      className={cx(S.header, { [S.draftHeader]: isDraft }, DRAG_HANDLE_CLASS)}
    >
      {icon && <Icon name={icon} size={16} />}
      <div className={S.headerText}>
        {typeof title === "string" ? (
          <div className={S.title}>{title}</div>
        ) : (
          title
        )}
        <div className={S.subtitle}>{subtitle}</div>
      </div>
      {stageIndex > 0 && (
        <span className={S.stageChip}>{t`Stage ${stageIndex + 1}`}</span>
      )}
      <CollapseButton isCollapsed={isCollapsed} onToggle={onToggleCollapsed} />
      {onRemove && (
        <button
          type="button"
          className={S.headerButton}
          aria-label={removeLabel}
          onClick={onRemove}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}
