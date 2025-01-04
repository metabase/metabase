import type { MouseEvent } from "react";

import { Icon } from "metabase/ui";

import styles from "./ExpandButton.module.css";

interface ExpandButtonProps {
  className?: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export const ExpandButton = ({ className, onClick }: ExpandButtonProps) => (
  <button
    className={className}
    onClick={onClick}
    data-testid="expand-column"
    aria-label="Expand column"
  >
    <Icon name="ellipsis" size={10} className={styles.icon} />
  </button>
);
