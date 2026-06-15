import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { browserHistory } from "react-router";

import { getBasename } from "./DataAppRouter";

export interface DataAppLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> {
  to: string;
  children?: ReactNode;
}

/**
 * Internal-only navigation link inside a data app.
 *
 * Deliberately does NOT delegate to react-router 3's `<Link>` —
 * v3 components use deprecated React APIs (`getDefaultProps`,
 * `childContextTypes`) that emit dev-mode warnings and will be removed
 * in React 19.
 */
export const DataAppLink = ({
  to,
  children,
  onClick,
  target,
  rel,
  ...rest
}: DataAppLinkProps) => {
  const href = getBasename() + to;

  const isExternalTarget = target != null && target !== "_self";
  const resolvedRel = rel ?? (isExternalTarget ? "noopener noreferrer" : rel);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (isExternalTarget) {
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
    <a
      href={href}
      target={target}
      rel={resolvedRel}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
};
