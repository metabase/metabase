import cx from "classnames";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

import {
  getPageBasename,
  isEmbeddedDataApp,
  navigate,
} from "embedding-sdk-package/lib/private/data-app-routing";

import S from "./DataAppLink.module.css";

export interface DataAppLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLElement>,
  "href"
> {
  to: string;
  children?: ReactNode;
}

/**
 * Navigates inside a Data App without requiring a router context.
 * Embedded apps use a button because a standalone tab cannot obtain the host's
 * credentials. Internal apps use links to the app's regular Metabase page.
 */
export const DataAppLink = ({
  to,
  children,
  onClick,
  target,
  rel,
  className,
  ...rest
}: DataAppLinkProps) => {
  const embedded = isEmbeddedDataApp();

  const isExternalTarget = target != null && target !== "_self";
  const resolvedRel = rel ?? (isExternalTarget ? "noopener noreferrer" : rel);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (embedded) {
      event.preventDefault();
      navigate(to);
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
      // Modifier keys / middle / right click — the browser handles it (new tab,
      // download, etc.). Don't preventDefault; the native action is wanted.
      return;
    }

    event.preventDefault();
    navigate(to);
  };

  if (embedded) {
    return (
      <button
        {...rest}
        type="button"
        className={cx(S.button, className)}
        onClick={handleClick}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      href={getPageBasename() + to}
      className={className}
      target={target}
      rel={resolvedRel}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
};
