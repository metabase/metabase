import { type AnchorHTMLAttributes, type ReactNode, useContext } from "react";
import { Link } from "react-router";

import { DataAppRouterContext, getBasename } from "./DataAppRouter";

interface DataAppLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> {
  to: string;
  children?: ReactNode;
}

/**
 * Internal-only navigation link inside a data app.
 *
 * Renders react-router 3's `<Link>` under the hood — middle-click /
 * cmd-click / modifier-key handling and `<a href>` rendering all come
 * from v3's implementation. When MB upgrades to a newer router, this
 * file's `import { Link } from "react-router"` changes; the bundle's
 * `<DataAppLink to="…">` usage doesn't.
 *
 * The `to` prop is bundle-relative (e.g. `to="/customers/42"`); we add
 * the auto-detected basename before handing the URL to v3's `Link`.
 */
export function DataAppLink({ to, children, ...rest }: DataAppLinkProps) {
  // Defensive — surface a clear error if the bundle puts `<DataAppLink>`
  // outside a `<DataAppRouter>`. v3's `<Link>` would fail more cryptically
  // (no router context) without this.
  const ctx = useContext(DataAppRouterContext);
  if (!ctx) {
    throw new Error("DataAppLink must be rendered inside a <DataAppRouter>");
  }

  const target = getBasename() + to;

  return (
    <Link to={target} {...rest}>
      {children}
    </Link>
  );
}
