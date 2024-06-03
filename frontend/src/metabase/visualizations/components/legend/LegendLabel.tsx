import cx from "classnames";
import {
  useCallback,
  useState,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import type { LinkProps } from "react-router";
import { Link } from "react-router";

import S from "./LegendLabel.module.css";

interface Props {
  children: ReactNode;
  className?: string;
  getHref?: () => LinkProps["to"];
  onClick: MouseEventHandler;
}

export const LegendLabel = ({
  children,
  className,
  getHref,
  onClick,
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
  const [href, setHref] = useState<LinkProps["to"]>("");

  const handleMouseEnter = () => {
    if (!href && getHref) {
      setHref(getHref());
    }
  };

  if (!getHref) {
    return (
      <div
        className={cx(S.text, className, {
          [S.link]: onClick,
        })}
        onClick={onClick}
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
      onMouseEnter={handleMouseEnter}
    >
      {children}
    </Link>
  );
};
