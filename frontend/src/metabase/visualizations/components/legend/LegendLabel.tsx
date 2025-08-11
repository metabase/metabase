import cx from "classnames";
import type React from "react";
import {
  type FocusEventHandler,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
  forwardRef,
  useCallback,
} from "react";
import type { LinkProps } from "react-router";
import { Link } from "react-router";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { Box } from "metabase/ui";

import S from "./LegendLabel.module.css";

interface Props {
  children: ReactNode;
  className?: string;
  href?: LinkProps["to"];
  onClick?: MouseEventHandler;
  onFocus: FocusEventHandler;
  onMouseEnter: MouseEventHandler;
}

// eslint-disable-next-line react/display-name
export const LegendLabel = forwardRef(
  (
    { children, className, href, onClick, onFocus, onMouseEnter }: Props,
    ref: React.Ref<any>,
  ) => {
    const handleLinkClick = useCallback(
      (event: MouseEvent) => {
        // Prefer programmatic onClick handling over native browser's href handling.
        // This helps to avoid e.g. 2 tabs opening when ctrl + clicking the link.
        event.preventDefault();
        onClick?.(event);
      },
      [onClick],
    );

    if (!href || !onClick) {
      return (
        <div
          ref={ref}
          className={cx(S.text, className, {
            [S.link]: onClick,
          })}
          onClick={onClick}
          onFocus={onFocus}
          onMouseEnter={onMouseEnter}
          data-testid="legend-label"
          data-is-clickable={!!onClick}
        >
          {children}
        </div>
      );
    }

    // If we are in the Embedding SDK, we should not be using the
    // Link component, as internal links would be inaccessible.
    if (isEmbeddingSdk()) {
      return (
        <Box
          ref={ref}
          className={cx(S.text, S.link, className)}
          onClick={handleLinkClick}
          onFocus={onFocus}
          onMouseEnter={onMouseEnter}
          data-testid="legend-label"
          data-is-clickable={!!onClick}
        >
          {children}
        </Box>
      );
    }

    return (
      <Link
        ref={ref}
        className={cx(S.text, S.link, className)}
        to={href}
        onClick={handleLinkClick}
        onFocus={onFocus}
        onMouseEnter={onMouseEnter}
        data-testid="legend-label"
        data-is-clickable={!!onClick}
      >
        {children}
      </Link>
    );
  },
);
