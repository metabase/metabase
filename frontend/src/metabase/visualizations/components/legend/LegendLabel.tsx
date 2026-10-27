import cx from "classnames";
import type React from "react";
import {
  type FocusEventHandler,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
  type TouchEventHandler,
  forwardRef,
  useCallback,
} from "react";

import type { LinkProps } from "metabase/common/components/Link";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
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
  onMouseDown?: MouseEventHandler;
  onTouchStart?: TouchEventHandler;
}

// eslint-disable-next-line react/display-name
export const LegendLabel = forwardRef(
  (
    {
      children,
      className,
      href,
      onClick,
      onFocus,
      onMouseEnter,
      onMouseDown,
      onTouchStart,
    }: Props,
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

    const labelClassName = cx(CS.textPrimary, CS.textBold, className, {
      [S.link]: onClick,
      [CS.cursorPointer]: onClick,
      [CS.textBrandHover]: onClick,
    });

    if (!href || !onClick) {
      return (
        <div
          ref={ref}
          className={labelClassName}
          onClick={onClick}
          onFocus={onFocus}
          onMouseEnter={onMouseEnter}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          data-testid="legend-label"
          data-is-clickable={Boolean(onClick)}
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
          className={labelClassName}
          onClick={handleLinkClick}
          onFocus={onFocus}
          onMouseEnter={onMouseEnter}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          data-testid="legend-label"
          data-is-clickable={Boolean(onClick)}
        >
          {children}
        </Box>
      );
    }

    return (
      <Link
        ref={ref}
        className={labelClassName}
        to={href}
        onClick={handleLinkClick}
        onFocus={onFocus}
        onMouseEnter={onMouseEnter}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        data-testid="legend-label"
        data-is-clickable={Boolean(onClick)}
      >
        {children}
      </Link>
    );
  },
);
