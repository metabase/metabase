import type { MouseEvent } from "react";
import cx from "classnames";

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
      aria-label="Expand column"
    >
      <Icon name="ellipsis" size={10} />
    </button>
  </span>
);
