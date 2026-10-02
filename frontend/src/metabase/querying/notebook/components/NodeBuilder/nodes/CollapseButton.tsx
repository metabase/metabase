import { t } from "ttag";

import { Icon } from "metabase/ui";

import S from "./nodes.module.css";

type CollapseButtonProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

// Folds a block down to its header and back.
export function CollapseButton({ isCollapsed, onToggle }: CollapseButtonProps) {
  return (
    <button
      type="button"
      className={S.headerButton}
      aria-expanded={!isCollapsed}
      aria-label={isCollapsed ? t`Expand` : t`Collapse`}
      onClick={onToggle}
    >
      <Icon name={isCollapsed ? "chevronright" : "chevrondown"} size={12} />
    </button>
  );
}
