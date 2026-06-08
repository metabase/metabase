import {
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useContext,
} from "react";

import { DataAppRouterContext } from "./DataAppRouter";

interface DataAppLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  children?: ReactNode;
}

/**
 * Internal-only navigation link inside a data app.
 *
 * Renders a real `<a href>` so middle-click / cmd-click open in a new tab
 * the way users expect. On a plain left-click, intercepts the navigation
 * and routes via `DataAppRouter`'s `navigate` — no full page reload.
 *
 * The `to` prop is bundle-relative (e.g. `to="/customers/42"`); the
 * provider's auto-detected basename is added when building the `href`.
 */
export function DataAppLink({
  to,
  children,
  onClick,
  ...rest
}: DataAppLinkProps) {
  const ctx = useContext(DataAppRouterContext);
  if (!ctx) {
    throw new Error("DataAppLink must be rendered inside a <DataAppRouter>");
  }

  // For the rendered `href`, use the parent's clean path so the link reads
  // correctly when hovered / right-clicked / shared. The provider's own
  // `navigate` knows how to translate it back when clicked.
  const parentBasename = window.location.pathname.match(
    /^\/embed\/data-app\/[^/]+/,
  )?.[0];
  const parentSurfaceBasename = parentBasename
    ? parentBasename.replace(/^\/embed/, "")
    : "";
  const href = parentSurfaceBasename + to;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    ctx.navigate(to);
  };

  return (
    <a {...rest} href={href} onClick={handleClick}>
      {children}
    </a>
  );
}
