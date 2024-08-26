import cx from "classnames";
import {
  type FocusEventHandler,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
  useCallback,
} from "react";
import type { LinkProps } from "react-router";
import { Link } from "react-router";

import S from "./LegendLabel.module.css";

interface Props {
  children: ReactNode;
  className?: string;
  href?: LinkProps["to"];
  onClick: MouseEventHandler;
  onFocus: FocusEventHandler;
  onMouseEnter: MouseEventHandler;
}

export const LegendLabel = ({
  children,
  className,
  href,
  onClick,
  onFocus,
  onMouseEnter,
}: Props) => {
  const handleLinkClick = useCallback(
    (event: MouseEvent) => {
      // Prefer programmatic onClick handling over native browser's href handling.
      // This helps to avoid e.g. 2 tabs opening when ctrl + clicking the link.
      event.preventDefault();
      onClick(event);
    },
    [onClick],
  );

  if (!href) {
    return (
      <div
        className={cx(S.text, className, {
          [S.link]: onClick,
        })}
        onClick={onClick}
        onFocus={onFocus}
        onMouseEnter={onMouseEnter}
      >
        {children}
      </div>
    );
  }

  return (
    <Link
      className={cx(S.text, S.link, className)}
      to={href}
      onClick={handleLinkClick}
      onFocus={onFocus}
      onMouseEnter={onMouseEnter}
    >
      {children}
    </Link>
  );
};
