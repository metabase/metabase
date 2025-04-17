import cx from "classnames";
import type { MouseEvent } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import S from "./ExpandButton.module.css";

interface ExpandButtonProps {
  className?: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export const ExpandButton = ({ className, onClick }: ExpandButtonProps) => (
  <span className={S.root}>
    <button
      className={cx(S.button, className)}
      onClick={onClick}
      data-testid="expand-column"
      aria-label={t`Expand column`}
    >
      <Icon name="ellipsis" size={10} />
    </button>
  </span>
);
