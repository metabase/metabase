import cx from "classnames";
import type { MouseEvent } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import type { Tab as TabType } from "../../tabs.types";

import S from "./Tab.module.css";

interface TabProps {
  tab: TabType;
  index: number;
  isActive: boolean;
  canClose: boolean;
  onActivate: (tab: TabType) => void;
  onClose: (tab: TabType) => void;
}

export function Tab({
  tab,
  index,
  isActive,
  canClose,
  onActivate,
  onClose,
}: TabProps) {
  const handleClose = (event: MouseEvent) => {
    event.stopPropagation();
    if (canClose) {
      onClose(tab);
    }
  };

  const shortcut = index < 9 ? `⌘${index + 1}` : undefined;

  return (
    <button
      type="button"
      className={cx(S.tab, { [S.active]: isActive, [S.solo]: !canClose })}
      onClick={() => onActivate(tab)}
      title={tab.title}
    >
      <Icon name={tab.icon} size={12} />
      <span className={S.title}>{tab.title}</span>
      {shortcut && <span className={S.shortcut}>{shortcut}</span>}
      {canClose && (
        <span
          role="button"
          aria-label={t`Close tab`}
          className={S.close}
          onClick={handleClose}
        >
          <Icon name="close" size={10} />
        </span>
      )}
    </button>
  );
}
