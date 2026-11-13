import { type MouseEvent, type ReactNode, useEffect, useRef } from "react";
import { t } from "ttag";

import { UnstyledButton } from "metabase/ui";

import S from "../SummarySidebar.module.css";

/** A second click within this time makes a double-click, which renames the chip instead. */
const DOUBLE_CLICK_MS = 200;

type FormulaEditButtonProps = {
  label: string;
  children: ReactNode;
  onEdit: () => void;
};

/** The label of a formula chip. A click opens the formula in the bar, unless a double-click follows. */
export function FormulaEditButton({
  label,
  children,
  onEdit,
}: FormulaEditButtonProps) {
  const clickTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    window.clearTimeout(clickTimer.current);
    if (event.detail === 0) {
      onEdit();
    } else if (event.detail === 1) {
      clickTimer.current = window.setTimeout(onEdit, DOUBLE_CLICK_MS);
    }
  };

  return (
    <UnstyledButton
      className={S.chipButton}
      aria-label={t`Edit the formula of ${label}`}
      onClick={handleClick}
    >
      {children}
    </UnstyledButton>
  );
}
