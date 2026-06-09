import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { browserHistory } from "react-router";

import { getBasename } from "./DataAppRouter";

interface DataAppLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  children?: ReactNode;
}

/**
 * Internal-only navigation link inside a data app.
 *
 * Renders a plain `<a href>` with our own click handler. Middle-click /
 * cmd-click / shift-click / alt-click / any non-primary button defer to
 * the browser's native handling (new tab, new window, download). Primary
 * left-clicks call `browserHistory.push()` to SPA-navigate.
 *
 * `to` is bundle-relative (e.g. `to="/customers/42"`); the auto-detected
 * basename is prepended before navigation so the real URL becomes
 * `/embed/data-app/<name>/customers/42`.
 *
 * Deliberately does NOT delegate to react-router 3's `<Link>` —
 * v3 components use deprecated React APIs (`getDefaultProps`,
 * `childContextTypes`) that emit dev-mode warnings and will be removed
 * in React 19. Keeping the implementation as a plain `<a>` means the
 * component has no class component, no legacy API surface, and no
 * coupling to the v3 router context.
 */
export const DataAppLink = ({
  to,
  children,
  onClick,
  target,
  ...rest
}: DataAppLinkProps) => {
  const href = getBasename() + to;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (target && target !== "_self") {
      // Explicit `target="_blank"` etc. — let the browser handle it.
      return;
    }

    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      // Modifier keys / middle / right click → browser handles it (new tab,
      // download, etc.). Don't preventDefault — we want the native action.
      return;
    }

    event.preventDefault();
    browserHistory.push(href);
  };

  return (
    <a href={href} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
